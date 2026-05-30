import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DocumentoFaseInterna,
  TipoDocumentoFaseInterna,
  StatusDocumento,
  OrigemDocumento,
} from './entities/documento-fase-interna.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Demanda } from '../demandas/entities/demanda.entity';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

type SeedSecoes = Record<string, { html: string; origem: string }>;

/**
 * Encadeamento por seed.
 * Deriva (pré-preenche) seções de um documento da fase interna a partir de
 * documentos a montante, da demanda e da licitação, para que o analista não
 * precise redigitar conteúdo já existente.
 */
@Injectable()
export class DerivacaoService {
  constructor(
    @InjectRepository(DocumentoFaseInterna)
    private readonly documentoRepository: Repository<DocumentoFaseInterna>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(Demanda)
    private readonly demandaRepository: Repository<Demanda>,
  ) {}

  /**
   * Retorna o HTML de uma seção de um documento irmão (mesma licitação,
   * versão atual) ou string vazia se não existir.
   */
  private secaoDe(
    docs: DocumentoFaseInterna[],
    tipoIrmao: TipoDocumentoFaseInterna,
    secaoId: string,
  ): string {
    const doc = docs.find((d) => d.tipo === tipoIrmao);
    if (!doc) return '';
    const dados = (doc.dados_estruturados as Record<string, string>) || {};
    const html = dados[secaoId];
    return typeof html === 'string' ? html : '';
  }

  /**
   * Monta o seed (conteúdo derivado) para um tipo de documento, sem persistir.
   * Apenas seções com HTML não-vazio entram no resultado.
   */
  async montarSeed(
    licitacaoId: string,
    tipo: string,
  ): Promise<{ secoes: SeedSecoes }> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['itens'],
    });
    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    let demanda: Demanda | null = null;
    if (licitacao.demanda_id) {
      demanda = await this.demandaRepository.findOne({
        where: { id: licitacao.demanda_id },
        relations: ['itens'],
      });
    }

    const docs = await this.documentoRepository.find({
      where: { licitacao_id: licitacaoId, versao_atual: true },
    });

    const secoes: SeedSecoes = {};
    const add = (id: string, html: string, origem: string) => {
      if (html && html.trim()) {
        secoes[id] = { html, origem };
      }
    };

    const tipoUpper = (tipo || '').toUpperCase();

    if (tipoUpper === TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA) {
      // DFD — derivado da Demanda/Processo
      let demandaHtml = `<p>Trata-se da necessidade de contratação referente a: ${licitacao.objeto}.</p>`;
      if (demanda) {
        demandaHtml += `<p>Demanda originada pela unidade requisitante ${demanda.unidade_requisitante}.</p>`;
      }
      add('demanda', demandaHtml, 'Processo/Demanda');

      // quantidade — itens da licitação (fallback itens da demanda)
      let quantidadeHtml = '';
      const itensLic = licitacao.itens || [];
      if (itensLic.length > 0) {
        quantidadeHtml =
          '<p>Quantitativos estimados:</p><ul>' +
          itensLic
            .map(
              (i) =>
                `<li>${i.descricao_resumida} — ${i.quantidade} ${i.unidade_medida}</li>`,
            )
            .join('') +
          '</ul>';
      } else if (demanda && (demanda.itens || []).length > 0) {
        quantidadeHtml =
          '<p>Quantitativos estimados:</p><ul>' +
          demanda.itens
            .map(
              (i) =>
                `<li>${i.descricao_objeto} — ${i.quantidade_estimada} ${i.unidade_medida}</li>`,
            )
            .join('') +
          '</ul>';
      }
      add('quantidade', quantidadeHtml, 'Itens');

      // previsao — vínculo com PCA
      const itensParaPca = itensLic.length > 0 ? itensLic : demanda?.itens || [];
      const temPca = itensParaPca.some((i: any) => !!i.item_pca_id);
      const previsaoHtml = temPca
        ? '<p>Os itens desta contratação constam do Plano de Contratações Anual (PCA) do exercício vigente.</p>'
        : '<p>A presente contratação não consta no PCA; justificativa a ser detalhada.</p>';
      add('previsao', previsaoHtml, 'PCA');
    } else if (tipoUpper === TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR) {
      // ETP — derivado do DFD + Processo
      const DFD = TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA;
      add('necessidade', this.secaoDe(docs, DFD, 'demanda'), 'DFD');
      add('previsao_pca', this.secaoDe(docs, DFD, 'previsao'), 'DFD');
      add('estimativa', this.secaoDe(docs, DFD, 'quantidade'), 'DFD');

      const valor = Number(licitacao.valor_total_estimado) || 0;
      if (valor > 0) {
        add(
          'estimativa_valor',
          `<p>Valor total estimado da contratação: ${BRL.format(valor)}.</p>`,
          'Processo',
        );
      }
    } else if (tipoUpper === TipoDocumentoFaseInterna.TERMO_REFERENCIA) {
      // TR — derivado do ETP + Processo
      const ETP = TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR;

      const necessidade = this.secaoDe(docs, ETP, 'necessidade');
      if (necessidade && necessidade.trim()) {
        add('objeto', necessidade, 'ETP');
      } else {
        add('objeto', `<p>${licitacao.objeto}</p>`, 'Processo');
      }

      add('fundamentacao', necessidade, 'ETP');
      add('descricao', this.secaoDe(docs, ETP, 'solucao'), 'ETP');
      add('requisitos', this.secaoDe(docs, ETP, 'requisitos'), 'ETP');

      const estimativaValor = this.secaoDe(docs, ETP, 'estimativa_valor');
      if (estimativaValor && estimativaValor.trim()) {
        add('estimativa_valor_tr', estimativaValor, 'ETP');
      } else {
        const valor = Number(licitacao.valor_total_estimado) || 0;
        if (valor > 0) {
          add(
            'estimativa_valor_tr',
            `<p>Valor total estimado da contratação: ${BRL.format(valor)}.</p>`,
            'Processo',
          );
        }
      }
    }

    return { secoes };
  }

  /**
   * Aplica o seed ao documento (versão atual) do tipo informado, criando o
   * rascunho se necessário. Por padrão só preenche seções vazias; com
   * sobrescrever=true substitui o conteúdo existente.
   */
  async aplicarSeed(
    licitacaoId: string,
    tipo: string,
    secoesIds: string[],
    sobrescrever: boolean,
  ): Promise<{ ok: true; dados_estruturados: Record<string, string> }> {
    const seed = await this.montarSeed(licitacaoId, tipo);
    const tipoEnum = tipo as TipoDocumentoFaseInterna;

    let documento = await this.documentoRepository.findOne({
      where: { licitacao_id: licitacaoId, tipo: tipoEnum, versao_atual: true },
    });

    if (!documento) {
      documento = this.documentoRepository.create({
        licitacao_id: licitacaoId,
        tipo: tipoEnum,
        titulo: tipo,
        status: StatusDocumento.EM_ELABORACAO,
        origem: OrigemDocumento.INTERNO,
        versao: 1,
        versao_atual: true,
        obrigatorio: true,
        dados_estruturados: {},
      });
    }

    const dados = (documento.dados_estruturados as Record<string, string>) || {};

    for (const secaoId of secoesIds) {
      const entrada = seed.secoes[secaoId];
      if (!entrada) continue;
      const atual = dados[secaoId];
      const vazio = !atual || (typeof atual === 'string' && !atual.trim());
      if (sobrescrever || vazio) {
        dados[secaoId] = entrada.html;
      }
    }

    documento.dados_estruturados = dados;
    documento.descricao = Object.values(dados)
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');

    await this.documentoRepository.save(documento);
    return { ok: true, dados_estruturados: dados };
  }
}
