import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import {
  PesquisaPrecoCandidato,
  StatusCandidatoPesquisaPreco,
} from './entities/pesquisa-preco-candidato.entity';
import {
  PesquisaPrecoExecucao,
  StatusExecucaoPesquisaPreco,
} from './entities/pesquisa-preco-execucao.entity';
import { FaseInternaService } from './fase-interna.service';
import {
  PesquisaPrecoAgentScope,
  PesquisaPrecoCandidateInput,
  PesquisaPrecoProvider,
} from './pesquisa-precos-agent.types';
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
import {
  CotacaoPorFonte,
  FontePesquisaTipo,
} from './types/pesquisa-precos.type';

const PDFDocument = require('pdfkit');

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
  private readonly uploadDir =
    process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

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
    const licitacao = await this.licitacaoRepository.findOneBy({
      id: licitacaoId,
    });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    const documento =
      await this.faseInternaService.getOuCriarDocPP(licitacaoId);
    const itens = await this.carregarItens(licitacaoId, scope.itemNumeros);
    if (!itens.length)
      throw new BadRequestException(
        'Nenhum item encontrado para pesquisa de precos',
      );

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
      const fontes = new Set(
        scope.fontes?.length ? scope.fontes : FONTES_PADRAO,
      );
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

      const coletados = providerResults.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      );
      const preparados = this.compliance
        .deduplicar(
          coletados
            .map((candidato) => this.compliance.prepararCandidato(candidato))
            .filter((candidato): candidato is PesquisaPrecoCandidateInput =>
              Boolean(candidato),
            ),
        )
        .slice(
          0,
          Math.max(1, itens.length) *
            Math.max(5, (scope.maxPorFonte || 5) * fontes.size),
        );

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
    if (!execucao)
      throw new NotFoundException('Execucao do agente nao encontrada');

    const candidatos = [...(execucao.candidatos || [])].sort(
      (a, b) => Number(b.score) - Number(a.score),
    );
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
    const candidato = await this.carregarCandidatoDaLicitacao(
      licitacaoId,
      candidatoId,
    );
    if (candidato.status === StatusCandidatoPesquisaPreco.APROVADO) {
      return this.faseInternaService.getPrecos(licitacaoId);
    }

    const comprovante = await this.gerarComprovanteCandidato(
      licitacaoId,
      candidato,
    );

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
        candidato.evidencia?.origem
          ? `Origem da evidencia: ${candidato.evidencia.origem}`
          : '',
        candidato.evidencia?.titulo
          ? `Titulo/objeto encontrado: ${candidato.evidencia.titulo}`
          : '',
        candidato.evidencia?.coletado_em
          ? `Coletado em: ${candidato.evidencia.coletado_em}`
          : '',
        candidato.score
          ? `Score de aderencia: ${Number(candidato.score).toFixed(2)}`
          : '',
        ...(candidato.flags || []),
      ]
        .filter(Boolean)
        .join(' | '),
      documento_comprobatorio_path: comprovante.path,
      documento_hash: comprovante.hash,
    };

    const dados = await this.faseInternaService.adicionarFontePreco(
      licitacaoId,
      candidato.item_numero,
      cotacao,
    );
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
    const candidato = await this.carregarCandidatoDaLicitacao(
      licitacaoId,
      candidatoId,
    );
    candidato.status = StatusCandidatoPesquisaPreco.REJEITADO;
    candidato.motivo_rejeicao = motivo || 'Rejeitado pelo usuario';
    candidato.decidido_em = new Date();
    candidato.decidido_por_id = decisor?.id || '';
    candidato.decidido_por_nome = decisor?.nome || '';
    await this.candidatoRepository.save(candidato);
    return candidato;
  }

  async importarNfe(
    licitacaoId: string,
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
    const documento =
      await this.faseInternaService.getOuCriarDocPP(licitacaoId);
    const execucao = await this.execucaoRepository.save(
      this.execucaoRepository.create({
        licitacao_id: licitacaoId,
        documento_id: documento.id,
        status: StatusExecucaoPesquisaPreco.CONCLUIDA,
        escopo: {
          fontes: ['NOTA_FISCAL_ELETRONICA'],
          itemNumeros: [body.itemNumero],
        },
        iniciado_em: new Date(),
        finalizado_em: new Date(),
      }),
    );

    const preparado = this.compliance.prepararCandidato({
      item_numero: body.itemNumero,
      fonte_tipo: 'NOTA_FISCAL_ELETRONICA',
      descricao_fonte:
        body.descricaoFonte || 'Nota Fiscal Eletronica importada',
      url_referencia: body.urlReferencia,
      data_pesquisa:
        body.dataPesquisa || new Date().toISOString().split('T')[0],
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
      this.candidatoRepository.create({
        ...preparado,
        execucao_id: execucao.id,
      }),
    );
    execucao.resumo = this.compliance.resumir([candidato]);
    await this.execucaoRepository.save(execucao);
    return this.obterExecucao(licitacaoId, execucao.id);
  }

  private async gerarComprovanteCandidato(
    licitacaoId: string,
    candidato: PesquisaPrecoCandidato,
  ): Promise<{ path: string; hash: string }> {
    if (candidato.evidencia?.path) {
      return {
        path: candidato.evidencia.path,
        hash: candidato.evidencia.hash || '',
      };
    }

    const dirPath = join(
      this.uploadDir,
      'pesquisa-precos',
      licitacaoId,
      'comprovantes-agente',
    );
    if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

    const filename = `comprovante-candidato-${candidato.item_numero}-${Date.now()}.pdf`;
    const filePath = join(dirPath, filename);
    const relativePath = join(
      'pesquisa-precos',
      licitacaoId,
      'comprovantes-agente',
      filename,
    ).replace(/\\/g, '/');

    await new Promise<void>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const stream = createWriteStream(filePath);
        doc.pipe(stream);

        const coletadoEm = candidato.evidencia?.coletado_em
          ? new Date(candidato.evidencia.coletado_em).toLocaleString('pt-BR')
          : new Date().toLocaleString('pt-BR');
        const valor = Number(candidato.valor_unitario || 0).toLocaleString(
          'pt-BR',
          {
            style: 'currency',
            currency: 'BRL',
          },
        );

        doc
          .font('Helvetica-Bold')
          .fontSize(16)
          .text('Comprovante de Pesquisa de Precos', { align: 'center' });
        doc.moveDown(0.5);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#555')
          .text(
            'Documento gerado automaticamente pelo Portal DCP a partir dos dados coletados pelo agente de pesquisa de precos.',
            {
              align: 'center',
            },
          );
        doc.moveDown(1);

        const linhas: Array<[string, string]> = [
          ['Item', String(candidato.item_numero)],
          ['Fonte', candidato.descricao_fonte || candidato.fonte_tipo],
          ['Tipo de fonte', candidato.fonte_tipo],
          [
            'Fornecedor/Orgao',
            candidato.fornecedor_razao_social || 'Nao informado',
          ],
          ['CNPJ', candidato.fornecedor_cnpj || 'Nao informado'],
          ['Valor unitario', valor],
          [
            'Quantidade base',
            candidato.quantidade_base
              ? String(candidato.quantidade_base)
              : 'Nao informada',
          ],
          ['Unidade', candidato.unidade || 'Nao informada'],
          ['Data da pesquisa', candidato.data_pesquisa],
          ['Coletado em', coletadoEm],
          [
            'Origem da coleta',
            candidato.evidencia?.origem || 'Agente de Pesquisa de Precos',
          ],
          ['URL', candidato.url_referencia || 'Sem URL verificavel informada'],
        ];

        for (const [label, value] of linhas) {
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#111')
            .text(`${label}:`, { continued: true });
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#222')
            .text(` ${value || '-'}`);
          doc.moveDown(0.25);
        }

        if (candidato.evidencia?.titulo) {
          doc.moveDown(0.4);
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#111')
            .text('Objeto/descricao encontrada:');
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#222')
            .text(candidato.evidencia.titulo, { align: 'justify' });
        }

        if (candidato.flags?.length) {
          doc.moveDown(0.6);
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#111')
            .text('Alertas e observacoes:');
          for (const flag of candidato.flags) {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor('#333')
              .text(`- ${flag}`, { align: 'justify' });
          }
        }

        doc.moveDown(1);
        doc
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor('#666')
          .text(
            'Este comprovante nao substitui a analise do responsavel pela pesquisa. Quando a URL estiver ausente ou indisponivel, valide a fonte e mantenha documentos complementares no processo.',
            { align: 'justify' },
          );

        doc.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });

    const hash = createHash('sha256')
      .update(readFileSync(filePath))
      .digest('hex');
    candidato.evidencia = {
      ...(candidato.evidencia || {}),
      tipo: 'arquivo',
      path: relativePath,
      hash,
    };
    await this.candidatoRepository.save(candidato);

    return { path: relativePath, hash };
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
        codigo_catalogo:
          item.codigo_catalogo || item.codigo_catmat || item.codigo_catser,
        codigo_catmat: item.codigo_catmat,
        codigo_catser: item.codigo_catser,
        quantidade: item.quantidade,
        unidade_medida: item.unidade as any,
        valor_unitario_estimado: item.valor_referencial || 0,
        valor_total_estimado:
          (item.valor_referencial || 0) * (item.quantidade || 1),
      }),
    );
  }

  private async carregarCandidatoDaLicitacao(
    licitacaoId: string,
    candidatoId: string,
  ) {
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
