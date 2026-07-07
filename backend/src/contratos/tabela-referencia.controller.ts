import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  ForbiddenException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { TabelaReferenciaService, ItemTabelaInput } from './tabela-referencia.service';

@Controller('contratos/tabelas-referencia')
@RequireModule(ModuloSistema.CONTRATOS)
export class TabelaReferenciaController {
  constructor(private readonly service: TabelaReferenciaService) {}

  private getOrgaoId(user: JwtPayload, orgaoIdParam?: string): string {
    if (user?.type === UserType.ORGAO) return user.sub;
    if (user?.type === UserType.ADMIN && orgaoIdParam) return orgaoIdParam;
    const orgaoId = (user as any)?.orgaoId || (user as any)?.orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  @Get()
  async listar(@Req() req: any) {
    const orgaoId = this.getOrgaoId(req.user, req.query?.orgaoId);
    return this.service.listarTabelas(orgaoId);
  }

  @Get(':id')
  async buscar(@Param('id') id: string) {
    return this.service.buscarTabela(id);
  }

  @Get(':id/itens')
  async listarItens(@Param('id') id: string) {
    return this.service.listarItens(id);
  }

  /** Cria tabela a partir de itens já revisados (import confirmado ou manual). */
  @Post()
  async criar(
    @Req() req: any,
    @Body()
    body: {
      nome: string;
      fonte?: string;
      uf?: string;
      edicao?: string;
      vigencia_inicio?: string;
      vigencia_fim?: string;
      observacoes?: string;
      itens?: ItemTabelaInput[];
    },
  ) {
    const orgaoId = this.getOrgaoId(req.user, req.query?.orgaoId);
    if (!body?.nome) throw new BadRequestException('Informe o nome da tabela.');
    return this.service.criarTabela(
      orgaoId,
      {
        nome: body.nome,
        fonte: body.fonte ?? null,
        uf: body.uf ?? null,
        edicao: body.edicao ?? null,
        vigencia_inicio: body.vigencia_inicio ? new Date(body.vigencia_inicio) : null,
        vigencia_fim: body.vigencia_fim ? new Date(body.vigencia_fim) : null,
        observacoes: body.observacoes ?? null,
        usuario_cadastro_id: (req.user as any)?.sub ?? null,
        usuario_cadastro_nome: (req.user as any)?.nome ?? (req.user as any)?.name ?? null,
      },
      body.itens || [],
    );
  }

  /** Substitui os itens da tabela (re-importação de nova edição). */
  @Post(':id/substituir-itens')
  async substituirItens(
    @Param('id') id: string,
    @Body() body: { itens: ItemTabelaInput[]; edicao?: string; observacoes?: string },
  ) {
    if (!body?.itens?.length) throw new BadRequestException('Envie os itens revisados.');
    return this.service.substituirItens(id, body.itens, { edicao: body.edicao, observacoes: body.observacoes });
  }

  @Put(':id')
  async atualizar(@Param('id') id: string, @Body() body: any) {
    return this.service.atualizarTabela(id, {
      ...body,
      vigencia_inicio: body?.vigencia_inicio ? new Date(body.vigencia_inicio) : undefined,
      vigencia_fim: body?.vigencia_fim ? new Date(body.vigencia_fim) : undefined,
    });
  }

  @Delete(':id')
  async excluir(@Param('id') id: string) {
    await this.service.excluirTabela(id);
    return { ok: true };
  }

  /** Semeia a tabela SINAPRO-BA 2025/2026 (caso LOOP) para o órgão. */
  @Post('seed/sinapro-ba')
  async seedSinapro(@Req() req: any) {
    const orgaoId = this.getOrgaoId(req.user, req.query?.orgaoId);
    return this.service.seedSinaproBa(orgaoId, {
      id: (req.user as any)?.sub,
      nome: (req.user as any)?.nome ?? (req.user as any)?.name,
    });
  }

  /** Prévia de importação por PDF (não persiste). */
  @Post('preview/pdf')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async previewPdf(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Envie o arquivo PDF no campo "arquivo".');
    const itens = await this.service.previewPdf(file.buffer);
    return { total: itens.length, itens };
  }

  /** Prévia de importação por CSV (não persiste). */
  @Post('preview/csv')
  async previewCsv(@Body() body: { conteudo: string }) {
    if (!body?.conteudo) throw new BadRequestException('Envie o conteúdo do CSV.');
    const itens = this.service.previewCsv(body.conteudo);
    return { total: itens.length, itens };
  }

  /**
   * Aplica itens da tabela de referência ao contrato, criando ItemCronograma
   * com o preço já descontado. Base do fluxo Requisição→OS/OF.
   */
  @Post('contrato/:contratoId/aplicar')
  async aplicarAoContrato(
    @Param('contratoId') contratoId: string,
    @Body()
    body: {
      selecoes: Array<{
        item_tabela_id: string;
        base?: 'total' | 'criacao' | 'finalizacao';
        quantidade?: number;
        desconto_pct?: number;
        descricao_override?: string;
      }>;
    },
  ) {
    if (!body?.selecoes?.length) throw new BadRequestException('Nenhum item selecionado.');
    const criados = await this.service.aplicarItensAoContrato(contratoId, body.selecoes);
    return { total: criados.length, itens: criados };
  }

  /**
   * Gera linhas de publicidade (SINAPRO −desconto / terceiros +honorário / mídia
   * −desconto de agência) como itens do contrato, prontas para a Ordem de Serviço.
   */
  @Post('contrato/:contratoId/gerar-linhas')
  async gerarLinhas(
    @Param('contratoId') contratoId: string,
    @Body()
    body: {
      linhas: Array<{
        tipo: 'SINAPRO' | 'TERCEIROS' | 'MIDIA';
        quantidade?: number;
        item_tabela_id?: string;
        base?: 'total' | 'criacao' | 'finalizacao';
        desconto_pct?: number;
        descricao?: string;
        custo?: number;
        honorario_pct?: number;
        valor_midia?: number;
        desconto_agencia_pct?: number;
      }>;
    },
  ) {
    if (!body?.linhas?.length) throw new BadRequestException('Nenhuma linha informada.');
    const criados = await this.service.gerarLinhasPublicidade(contratoId, body.linhas);
    return { total: criados.length, itens: criados };
  }
}
