import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CredenciamentoService } from './credenciamento.service';
import { Credenciamento, StatusCredenciamento, StatusCredenciado, TipoCredenciamento } from './entities/credenciamento.entity';
import { Public } from '../auth/public.decorator';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { orgaoSemSegredos } from '../licitacoes/licitacao-visao.util';

/**
 * AUTORIZAÇÃO (E1a):
 *  - lista interna: só os credenciamentos do órgão do token (?orgaoId= só admin);
 *  - credenciamento por id (não público), estatísticas, credenciados e atos
 *    (alterar, publicar, iniciar inscrições, encerrar, analisar inscrito):
 *    somente o órgão DONO (leitura de outro órgão → 404; ato → 403);
 *  - inscrição: só fornecedor, com identidade (id, CNPJ, razão social) do token/cadastro;
 *  - publicos/*: inalterados (dados públicos).
 */
@Controller('credenciamento')
export class CredenciamentoController {
  constructor(
    private readonly service: CredenciamentoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /** Órgão das listas: o do token; admin da plataforma filtra por ?orgaoId=. */
  private orgaoDaLista(ator: Ator, orgaoIdParam?: string): string {
    if (ator?.admin && orgaoIdParam) return orgaoIdParam;
    if (ehOrgao(ator)) return ator.orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  /** Remove credenciais do órgão relacionado (senha, SMTP, PNCP...). */
  private semSegredos<T extends { orgao?: any }>(c: T): T {
    if (c?.orgao) c.orgao = orgaoSemSegredos(c.orgao);
    return c;
  }

  // ============ CRUD ============

  @Post()
  @SomenteOrgao()
  async criar(@Body() dados: Partial<Credenciamento>, @AtorAtual() ator: Ator) {
    // Órgão só cria no próprio nome (admin da plataforma escolhe o órgão)
    if (!ator.admin) {
      if (dados.orgao_id && dados.orgao_id !== ator.orgaoId) {
        throw new ForbiddenException('Acesso negado: não é possível criar credenciamento para outro órgão');
      }
      dados.orgao_id = ator.orgaoId!;
    }
    return this.service.criar(dados);
  }

  @Get()
  @SomenteOrgao()
  async findAll(
    @AtorAtual() ator: Ator,
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('status') status?: StatusCredenciamento,
    @Query('tipo') tipo?: TipoCredenciamento
  ) {
    const orgaoId = this.orgaoDaLista(ator, orgaoIdParam);
    return this.service.findAll({ orgaoId, status, tipo });
  }

  @Public()
  @Get('publicos')
  async findPublicos(
    @Query('tipo') tipo?: TipoCredenciamento,
    @Query('uf') uf?: string
  ) {
    return this.service.findPublicos({ tipo, uf });
  }

  @Public()
  @Get('publicos/:id')
  async findPublicoById(@Param('id') id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Credenciamento não encontrado');
    return this.service.findPublicoById(id);
  }

  @Get(':id')
  @SomenteOrgao()
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id, 'leitura');
    return this.semSegredos(await this.service.findOne(id));
  }

  @Get(':id/estatisticas')
  @SomenteOrgao()
  async getEstatisticas(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id, 'leitura');
    return this.service.getEstatisticas(id);
  }

  @Put(':id')
  @SomenteOrgao()
  async atualizar(@Param('id') id: string, @Body() dados: Partial<Credenciamento>, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    // Não muda de órgão nem mexe nos inscritos por edição
    const { orgao_id: _orgaoId, orgao: _orgao, credenciados: _cred, ...resto } = (dados || {}) as any;
    return this.semSegredos(await this.service.atualizar(id, resto));
  }

  @Patch(':id/publicar')
  @SomenteOrgao()
  async publicar(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    return this.semSegredos(await this.service.publicar(id));
  }

  @Patch(':id/iniciar-inscricoes')
  @SomenteOrgao()
  async iniciarInscricoes(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    return this.semSegredos(await this.service.iniciarInscricoes(id));
  }

  @Patch(':id/encerrar')
  @SomenteOrgao()
  async encerrar(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id);
    return this.semSegredos(await this.service.encerrar(id));
  }

  // ============ CREDENCIADOS ============

  /** Inscrição do fornecedor: identidade SEMPRE do token/cadastro (fornecedor_id do corpo divergente → 403). */
  @Post(':id/inscrever')
  @SomenteFornecedor()
  async inscreverFornecedor(
    @Param('id') id: string,
    @Body() dados: {
      fornecedor_id?: string;
      fornecedor_cnpj?: string;
      fornecedor_razao_social?: string;
      documentos_enviados?: any;
    },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, dados?.fornecedor_id);
    if (!ehUuid(id)) throw new NotFoundException('Credenciamento não encontrado');
    const cadastro = await this.service.dadosDoFornecedor(fornecedorId);
    return this.service.inscreverFornecedor(id, {
      fornecedor_id: fornecedorId,
      fornecedor_cnpj: cadastro?.cpf_cnpj ?? dados?.fornecedor_cnpj ?? '',
      fornecedor_razao_social: cadastro?.razao_social ?? dados?.fornecedor_razao_social ?? '',
      documentos_enviados: dados?.documentos_enviados,
    });
  }

  @Get(':id/credenciados')
  @SomenteOrgao()
  async findCredenciados(
    @Param('id') id: string,
    @AtorAtual() ator: Ator,
    @Query('status') status?: StatusCredenciado
  ) {
    await this.acesso.assertOrgaoDoCredenciamento(ator, id, 'leitura');
    return this.service.findCredenciados(id, status);
  }

  @Patch('credenciados/:credenciadoId/analisar')
  @SomenteOrgao()
  async analisarCredenciado(
    @Param('credenciadoId') credenciadoId: string,
    @Body() dados: {
      status: StatusCredenciado;
      parecer: string;
      analista_nome: string;
      motivo_reprovacao?: string;
    },
    @AtorAtual() ator: Ator,
  ) {
    const credenciamentoId = await this.service.credenciamentoIdDoCredenciado(credenciadoId);
    if (!credenciamentoId) throw new NotFoundException('Credenciado não encontrado');
    await this.acesso.assertOrgaoDoCredenciamento(ator, credenciamentoId);
    return this.service.analisarCredenciado(credenciadoId, dados);
  }
}
