import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { PesquisaPrecoCandidato, StatusCandidatoPesquisaPreco } from './entities/pesquisa-preco-candidato.entity';
import { PesquisaPrecoExecucao, StatusExecucaoPesquisaPreco } from './entities/pesquisa-preco-execucao.entity';
import { FaseInternaService } from './fase-interna.service';
import { PesquisaPrecoAgentScope, PesquisaPrecoCandidateInput, PesquisaPrecoProvider } from './pesquisa-precos-agent.types';
import { PesquisaPrecosComplianceService } from './pesquisa-precos-compliance.service';
import {
  BrowserFallbackProvider,
  ContratosVigentesProvider,
  FontePrecosProvider,
  FornecedorDiretoProvider,
  NfeProvider,
  PainelComprasGovProvider,
  PncpPriceProvider,
  WebEspecializadaProvider,
} from './pesquisa-precos-providers.service';
import { CotacaoPorFonte, FontePesquisaTipo } from './types/pesquisa-precos.type';

const FONTES_PADRAO: FontePesquisaTipo[] = [
  'PNCP',
  'PAINEL_DE_PRECOS',
  'CONTRATO_VIGENTE_SISTEMA',
  'MIDIA_ESPECIALIZADA',
  'FORNECEDOR_DIRETO',
  'NOTA_FISCAL_ELETRONICA',
];

@Injectable()
export class PesquisaPrecosAgentService {
  private readonly providers: PesquisaPrecoProvider[];

  constructor(
    @InjectRepository(PesquisaPrecoExecucao)
    private readonly execucaoRepository: Repository<PesquisaPrecoExecucao>,
    @InjectRepository(PesquisaPrecoCandidato)
    private readonly candidatoRepository: Repository<PesquisaPrecoCandidato>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
    private readonly faseInternaService: FaseInternaService,
    private readonly compliance: PesquisaPrecosComplianceService,
    pncpProvider: PncpPriceProvider,
    painelProvider: PainelComprasGovProvider,
    fontePrecosProvider: FontePrecosProvider,
    contratosProvider: ContratosVigentesProvider,
    webProvider: WebEspecializadaProvider,
    fornecedorProvider: FornecedorDiretoProvider,
    nfeProvider: NfeProvider,
    browserProvider: BrowserFallbackProvider,
  ) {
    this.providers = [
      pncpProvider,
      painelProvider,
      fontePrecosProvider,
      contratosProvider,
      webProvider,
      fornecedorProvider,
      nfeProvider,
      browserProvider,
    ];
  }

  async executar(licitacaoId: string, scope: PesquisaPrecoAgentScope) {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    const documento = await this.faseInternaService.getOuCriarDocPP(licitacaoId);
    const itens = await this.carregarItens(licitacaoId, scope.itemNumeros);
    if (!itens.length) throw new BadRequestException('Nenhum item encontrado para pesquisa de precos');

    const execucao = await this.execucaoRepository.save(
      this.execucaoRepository.create({
        licitacao_id: licitacaoId,
        documento_id: documento.id,
        status: StatusExecucaoPesquisaPreco.RODANDO,
        escopo: {
          itemNumeros: scope.itemNumeros,
          fontes: scope.fontes || FONTES_PADRAO,
          maxPorFonte: scope.maxPorFonte || 5,
          usarBrowserFallback: scope.usarBrowserFallback || false,
        },
        iniciado_por_id: scope.iniciadoPorId,
        iniciado_por_nome: scope.iniciadoPorNome,
        iniciado_em: new Date(),
      }),
    );

    try {
      const fontes = new Set(scope.fontes?.length ? scope.fontes : FONTES_PADRAO);
      if (scope.usarBrowserFallback) fontes.add('OUTRA');

      const providerResults = await Promise.allSettled(
        this.providers
          .filter((provider) => fontes.has(provider.fonte))
          .map((provider) =>
            provider.buscar({
              licitacao,
              itens,
              scope: { ...scope, maxPorFonte: scope.maxPorFonte || 5 },
            }),
          ),
      );

      const coletados = providerResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
      const preparados = this.compliance
        .deduplicar(
          coletados
            .map((candidato) => this.compliance.prepararCandidato(candidato))
            .filter((candidato): candidato is PesquisaPrecoCandidateInput => Boolean(candidato)),
        )
        .slice(0, Math.max(1, itens.length) * Math.max(5, (scope.maxPorFonte || 5) * fontes.size));

      const candidatos = await this.candidatoRepository.save(
        preparados.map((candidato) =>
          this.candidatoRepository.create({
            ...candidato,
            execucao_id: execucao.id,
          }),
        ),
      );

      execucao.status = StatusExecucaoPesquisaPreco.CONCLUIDA;
      execucao.finalizado_em = new Date();
      execucao.resumo = this.compliance.resumir(candidatos);
      await this.execucaoRepository.save(execucao);

      return this.obterExecucao(licitacaoId, execucao.id);
    } catch (error) {
      execucao.status = StatusExecucaoPesquisaPreco.FALHOU;
      execucao.finalizado_em = new Date();
      execucao.erro = (error as Error).message;
      await this.execucaoRepository.save(execucao);
      throw error;
    }
  }

  async obterExecucao(licitacaoId: string, execucaoId: string) {
    const execucao = await this.execucaoRepository.findOne({
      where: { id: execucaoId, licitacao_id: licitacaoId },
      relations: ['candidatos'],
      order: { candidatos: { score: 'DESC' } },
    });
    if (!execucao) throw new NotFoundException('Execucao do agente nao encontrada');

    const candidatos = [...(execucao.candidatos || [])].sort((a, b) => Number(b.score) - Number(a.score));
    return {
      ...execucao,
      candidatos,
      resumo: execucao.resumo || this.compliance.resumir(candidatos),
    };
  }

  async listarExecucoes(licitacaoId: string) {
    return this.execucaoRepository.find({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' },
      take: 10,
    });
  }

  async aprovarCandidato(
    licitacaoId: string,
    candidatoId: string,
    decisor?: { id?: string; nome?: string },
  ) {
    const candidato = await this.carregarCandidatoDaLicitacao(licitacaoId, candidatoId);
    if (candidato.status === StatusCandidatoPesquisaPreco.APROVADO) {
      return this.faseInternaService.getPrecos(licitacaoId);
    }

    const cotacao: CotacaoPorFonte = {
      fonte: candidato.fonte_tipo,
      descricao_fonte: candidato.descricao_fonte,
      url_referencia: candidato.url_referencia || undefined,
      data_pesquisa: candidato.data_pesquisa,
      fornecedor_cnpj: candidato.fornecedor_cnpj || undefined,
      fornecedor_razao_social: candidato.fornecedor_razao_social || undefined,
      valor_unitario: Number(candidato.valor_unitario),
      observacao: [
        'Incluida por Agente de Pesquisa de Precos',
        ...(candidato.flags || []),
      ].join(' | '),
      documento_comprobatorio_path: candidato.evidencia?.path,
      documento_hash: candidato.evidencia?.hash,
    };

    const dados = await this.faseInternaService.adicionarFontePreco(licitacaoId, candidato.item_numero, cotacao);
    candidato.status = StatusCandidatoPesquisaPreco.APROVADO;
    candidato.decidido_em = new Date();
    candidato.decidido_por_id = decisor?.id || '';
    candidato.decidido_por_nome = decisor?.nome || '';
    await this.candidatoRepository.save(candidato);

    return { dados, candidato };
  }

  async rejeitarCandidato(
    licitacaoId: string,
    candidatoId: string,
    motivo: string,
    decisor?: { id?: string; nome?: string },
  ) {
    const candidato = await this.carregarCandidatoDaLicitacao(licitacaoId, candidatoId);
    candidato.status = StatusCandidatoPesquisaPreco.REJEITADO;
    candidato.motivo_rejeicao = motivo || 'Rejeitado pelo usuario';
    candidato.decidido_em = new Date();
    candidato.decidido_por_id = decisor?.id || '';
    candidato.decidido_por_nome = decisor?.nome || '';
    await this.candidatoRepository.save(candidato);
    return candidato;
  }

  async importarNfe(licitacaoId: string, body: {
    itemNumero: number;
    descricaoFonte?: string;
    urlReferencia?: string;
    fornecedorCnpj?: string;
    fornecedorRazaoSocial?: string;
    valorUnitario: number;
    dataPesquisa?: string;
    documentoPath?: string;
    documentoHash?: string;
  }) {
    const documento = await this.faseInternaService.getOuCriarDocPP(licitacaoId);
    const execucao = await this.execucaoRepository.save(
      this.execucaoRepository.create({
        licitacao_id: licitacaoId,
        documento_id: documento.id,
        status: StatusExecucaoPesquisaPreco.CONCLUIDA,
        escopo: { fontes: ['NOTA_FISCAL_ELETRONICA'], itemNumeros: [body.itemNumero] },
        iniciado_em: new Date(),
        finalizado_em: new Date(),
      }),
    );

    const preparado = this.compliance.prepararCandidato({
      item_numero: body.itemNumero,
      fonte_tipo: 'NOTA_FISCAL_ELETRONICA',
      descricao_fonte: body.descricaoFonte || 'Nota Fiscal Eletronica importada',
      url_referencia: body.urlReferencia,
      data_pesquisa: body.dataPesquisa || new Date().toISOString().split('T')[0],
      fornecedor_cnpj: body.fornecedorCnpj,
      fornecedor_razao_social: body.fornecedorRazaoSocial,
      valor_unitario: Number(body.valorUnitario),
      evidencia: {
        tipo: 'arquivo',
        path: body.documentoPath,
        hash: body.documentoHash,
        origem: 'NF-e importada',
        coletado_em: new Date().toISOString(),
      },
      score: 84,
    });
    if (!preparado) throw new BadRequestException('Dados da NF-e invalidos');

    const candidato = await this.candidatoRepository.save(
      this.candidatoRepository.create({ ...preparado, execucao_id: execucao.id }),
    );
    execucao.resumo = this.compliance.resumir([candidato]);
    await this.execucaoRepository.save(execucao);
    return this.obterExecucao(licitacaoId, execucao.id);
  }

  private async carregarItens(licitacaoId: string, itemNumeros?: number[]) {
    const where = itemNumeros?.length
      ? { licitacao_id: licitacaoId, numero_item: In(itemNumeros) }
      : { licitacao_id: licitacaoId };

    const itens = await this.itemRepository.find({
      where,
      order: { numero_item: 'ASC' },
    });

    if (itens.length) return itens;

    const precos = await this.faseInternaService.getPrecos(licitacaoId);
    return (precos.dados.itens || []).map((item) =>
      this.itemRepository.create({
        licitacao_id: licitacaoId,
        numero_item: item.item_numero,
        descricao_resumida: item.descricao,
        descricao_detalhada: item.descricao,
        codigo_catalogo: item.codigo_catalogo || item.codigo_catmat || item.codigo_catser,
        codigo_catmat: item.codigo_catmat,
        codigo_catser: item.codigo_catser,
        quantidade: item.quantidade,
        unidade_medida: item.unidade as any,
        valor_unitario_estimado: item.valor_referencial || 0,
        valor_total_estimado: (item.valor_referencial || 0) * (item.quantidade || 1),
      }),
    );
  }

  private async carregarCandidatoDaLicitacao(licitacaoId: string, candidatoId: string) {
    const candidato = await this.candidatoRepository.findOne({
      where: { id: candidatoId },
      relations: ['execucao'],
    });
    if (!candidato || candidato.execucao.licitacao_id !== licitacaoId) {
      throw new NotFoundException('Candidato nao encontrado nesta licitacao');
    }
    return candidato;
  }
}
