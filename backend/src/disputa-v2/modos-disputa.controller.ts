import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DisputaService } from './disputa.service';
import { DisputaGateway } from './disputa.gateway';
import { ModoDisputaService } from './modo-disputa.service';
import { DesconexaoPregoeiroService } from './desconexao-pregoeiro.service';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, SomenteFornecedor, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { OrigemLance } from './modelo-lance';
import { motivoModoCriterioInvalido } from './modos-disputa';

/**
 * ============================================================================
 * ATOS DOS MODOS DE DISPUTA (plano E2.4) — mesmo motor, mesmas guardas (E1a)
 * ============================================================================
 *
 *  - reinício para as demais colocações (Lei 14.133 art. 56 §4º) — órgão dono;
 *  - comunicação da data de reinício após desconexão do agente (IN 73 art. 27
 *    §1º) — órgão dono;
 *  - lance final fechado explícito (IN 73 art. 24 §2º) — fornecedor do TOKEN.
 *    (O `enviar_lance`/`POST lance` comuns também viram lance fechado quando o
 *    item está na etapa fechada: é o mesmo `registrarLance`.)
 *  - consulta da combinação modo × critério (art. 56 §§1º-2º) para as telas.
 */
@Controller('disputa-v2')
export class ModosDisputaController {
  constructor(
    private readonly disputaService: DisputaService,
    private readonly modos: ModoDisputaService,
    private readonly desconexao: DesconexaoPregoeiroService,
    private readonly acesso: AcessoLicitacaoService,
    private readonly gateway: DisputaGateway,
    private readonly dataSource: DataSource,
  ) {}

  @AutenticacaoOpcional()
  @Get('modos/validar')
  validarModoCriterio(@Query('modo') modo: string, @Query('criterio') criterio: string) {
    const motivo = motivoModoCriterioInvalido(modo, criterio);
    return { valido: !motivo, motivo };
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/item/:itemId/reiniciar-demais')
  async reiniciarDemais(
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @Body() body: { justificativa: string },
    @AtorAtual() ator: Ator,
  ) {
    if (!ehUuid(itemId)) throw new BadRequestException('itemId inválido');
    const dono = await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    const [item] = await this.acessoItem(itemId, dono.licitacaoId);
    const alerta = await this.disputaService.avaliarReinicio(sessaoId, item);
    const ranking = await this.disputaService.rankingDoItem(itemId);
    const r = await this.modos.reiniciarDemaisColocacoes(sessaoId, itemId, body?.justificativa, alerta, ranking, atorTransicaoDe(ator));
    await this.difundirFase(sessaoId, dono.licitacaoId, itemId, 'REINICIO_DEMAIS', r.mensagem);
    const { mensagem, ...resto } = r;
    return { success: true, ...resto };
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/agendar-retomada')
  async agendarRetomada(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { retomadaEm: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    const data = new Date(body?.retomadaEm);
    const r = await this.desconexao.agendarRetomada(sessaoId, data, atorTransicaoDe(ator));
    return { success: true, retomadaEm: r.retomadaEm };
  }

  @SomenteFornecedor()
  @Post('sessao/:sessaoId/lance-fechado')
  async lanceFechado(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { itemId: string; valor: number },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, undefined);
    const dono = await this.acesso.donoDaSessao(sessaoId);
    if (!dono) throw new NotFoundException('Sessão não encontrada');
    await this.acesso.assertFornecedorParticipa(ator, dono.licitacaoId);
    if (!ehUuid(body?.itemId)) throw new BadRequestException('itemId inválido');
    const lance = await this.disputaService.registrarLance({
      sessaoId,
      itemId: body.itemId,
      fornecedorId,
      valor: Number(body.valor),
      ip: 'API',
      origem: OrigemLance.LANCE_FECHADO,
    });
    await this.gateway.difundirNovoLance(sessaoId, dono.licitacaoId, lance);
    // O valor volta só para quem enviou (sigiloso para os demais até o fim do prazo)
    return { id: lance.id, itemId: lance.item_id, valor: Number(lance.valor), origem: lance.origem, registradoEm: lance.created_at };
  }

  /** Unidade (item ou lote) da licitação da sessão, com o número para o aviso. */
  private async acessoItem(unidadeId: string, licitacaoId: string): Promise<Array<{ id: string; numero_item: number }>> {
    const rows: Array<{ id: string; numero_item: number; licitacao_id: string }> = await this.dataSource.query(
      `SELECT id::text AS id, numero AS numero_item, licitacao_id::text AS licitacao_id FROM lotes_licitacao WHERE id = $1
       UNION ALL SELECT id::text, numero_item, licitacao_id::text FROM itens_licitacao WHERE id = $1`,
      [unidadeId],
    );
    if (!rows[0] || rows[0].licitacao_id !== String(licitacaoId)) throw new BadRequestException('Item/lote não pertence a esta sessão');
    return rows;
  }

  private async difundirFase(sessaoId: string, licitacaoId: string, itemId: string, fase: string, mensagem: any) {
    try {
      await this.gateway.emitirItensPorVisao(sessaoId, licitacaoId, 'fase_item_alterada', { itemId, fase });
      this.gateway.server?.to(`sessao:${sessaoId}`).emit('nova_mensagem', {
        id: mensagem.id,
        tipo: 'SISTEMA',
        remetente: 'SISTEMA',
        conteudo: mensagem.descricao,
        dataHora: mensagem.created_at,
      });
    } catch {
      /* difusão nunca desfaz o ato */
    }
  }
}
