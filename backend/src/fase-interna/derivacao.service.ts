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
import { fundamentoEfetivo, textoDoFundamento } from '../licitacoes/fundamento-legal';
import { createHash } from 'crypto';
import { modoDisputaDaDispensa, textoFormaDisputa } from '../licitacoes/modo-disputa-dispensa';
import { quantidadeComUnidade, rotuloCriterio, rotuloModalidade, rotuloModoDisputa } from './textos-documento';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

type SeedSecoes = Record<string, { html: string; origem: string }>;

/** Impressão do texto de uma seção derivada (sabe se o usuário mexeu depois). */
export const hashSecao = (html: string) => createHash('sha256').update(String(html ?? '').trim()).digest('hex').slice(0, 32);

/**
 * Textos de ESTIMATIVA que o próprio sistema escrevia antes de guardar a
 * impressão das derivadas (`_derivadas`) — reconhecidos para serem
 * atualizados pela pesquisa ao regerar (homologação: TR com R$ 24.000 da
 * estimativa inicial em vez dos R$ 22.600 da pesquisa).
 */
const ESTIMATIVA_AUTOMATICA_ANTIGA = /^<p>Valor total estimado da contratação: R\$\s?[\d.]+,\d{2}(, apurado na pesquisa de preços \(art\. 23\))?\.<\/p>$/;

const ROTULO_METODO: Record<string, string> = { MENOR: 'menor preço', MEDIA: 'média aritmética', MEDIANA: 'mediana' };

/** Seção derivada pelo sistema e não alterada depois (pode ser atualizada ao regerar). */
export function secaoDerivadaIntocada(atual: unknown, secaoId: string, derivadas: Record<string, string> | null | undefined): boolean {
  if (typeof atual !== 'string' || !atual.trim()) return true;
  if (derivadas?.[secaoId] && derivadas[secaoId] === hashSecao(atual)) return true;
  return ['estimativa_valor', 'estimativa_valor_tr'].includes(secaoId) && ESTIMATIVA_AUTOMATICA_ANTIGA.test(atual.trim());
}

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

    // Valor estimado = soma dos itens (a emissão do mapa da pesquisa — ou os
    // valores digitados da pesquisa feita fora — grava o valor de cada item)
    const totalItens =
      Math.round(
        (licitacao.itens || [])
          .filter((i: any) => String(i.status ?? 'ATIVO') !== 'CANCELADO')
          .reduce((soma: number, i: any) => {
            const t = Number(i.valor_total_estimado);
            return soma + (Number.isFinite(t) && t > 0 ? t : Number(i.quantidade || 0) * Number(i.valor_unitario_estimado || 0));
          }, 0) * 100,
      ) / 100;
    const valorProcesso = totalItens > 0 ? totalItens : Number(licitacao.valor_total_estimado) || 0;
    // Pesquisa de preços concluída (mapa emitido aqui ou a peça anexada/assinada)
    const pp = docs.find((d) => d.tipo === TipoDocumentoFaseInterna.PESQUISA_PRECOS);
    const ppDados: any = pp?.dados_estruturados || {};
    const pesquisaConcluida =
      !!pp && !ppDados.nao_se_aplica && (!!ppDados.mapa_gerado_em || pp.origem !== OrigemDocumento.INTERNO || pp.status === StatusDocumento.ASSINADO);
    const metodoPesquisa = ROTULO_METODO[String(ppDados.metodo ?? '')] ?? null;
    const textoValorPesquisa = (v: number) =>
      `<p>Valor total estimado da contratação: ${BRL.format(v)}, apurado na pesquisa de preços constante dos autos (art. 23 da Lei nº 14.133/2021)${metodoPesquisa ? `, pelo método do ${metodoPesquisa}` : ''}. O detalhamento por item consta da tabela de itens deste documento.</p>`;

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
                `<li>${i.descricao_resumida} — ${quantidadeComUnidade(i.quantidade, i.unidade_medida)}${
                  i.codigo_catser ? ` (CATSER ${i.codigo_catser})` : i.codigo_catmat ? ` (CATMAT ${i.codigo_catmat})` : ''
                }</li>`,
            )
            .join('') +
          '</ul>';
      } else if (demanda && (demanda.itens || []).length > 0) {
        quantidadeHtml =
          '<p>Quantitativos estimados:</p><ul>' +
          demanda.itens
            .map(
              (i) =>
                `<li>${i.descricao_objeto} — ${quantidadeComUnidade(i.quantidade_estimada, i.unidade_medida)}</li>`,
            )
            .join('') +
          '</ul>';
      }
      add('quantidade', quantidadeHtml, 'Itens');

      // previsao — vínculo com PCA (o do processo — tela do DFD — ou o dos itens)
      const itensParaPca = itensLic.length > 0 ? itensLic : demanda?.itens || [];
      const temPca = !!licitacao.item_pca_id || itensParaPca.some((i: any) => !!i.item_pca_id);
      const previsaoHtml = temPca
        ? '<p>Os itens desta contratação constam do Plano de Contratações Anual (PCA) do exercício vigente.</p>'
        : licitacao.sem_pca && licitacao.justificativa_sem_pca
          ? `<p>A contratação não consta do Plano de Contratações Anual. Justificativa (art. 12, §1º): ${licitacao.justificativa_sem_pca}</p>`
          : '<p>A presente contratação não consta no PCA; justificativa a ser detalhada.</p>';
      add('previsao', previsaoHtml, 'PCA');

      // Unidade requisitante e responsável (campos da tela do DFD)
      const dfdAtual = docs.find((d) => d.tipo === TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA);
      const campos = dfdAtual?.dados_estruturados?._dfd;
      if (campos?.unidade_requisitante_nome && !demanda) {
        secoes.demanda = {
          html: `${secoes.demanda?.html ?? ''}<p>Unidade requisitante: ${campos.unidade_requisitante_nome}${campos.responsavel_nome ? ` — responsável: ${campos.responsavel_nome}` : ''}.</p>`,
          origem: 'DFD',
        };
      }
    } else if (tipoUpper === TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR) {
      // ETP — derivado do DFD + Processo
      const DFD = TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA;
      add('necessidade', this.secaoDe(docs, DFD, 'demanda'), 'DFD');
      add('previsao_pca', this.secaoDe(docs, DFD, 'previsao'), 'DFD');
      add('estimativa', this.secaoDe(docs, DFD, 'quantidade'), 'DFD');

      if (pesquisaConcluida && valorProcesso > 0) {
        add('estimativa_valor', textoValorPesquisa(valorProcesso).replace(' O detalhamento por item consta da tabela de itens deste documento.', ''), 'Pesquisa de preços');
      } else if (valorProcesso > 0) {
        add(
          'estimativa_valor',
          `<p>Valor total estimado preliminarmente em ${BRL.format(valorProcesso)}, a ser confirmado pela pesquisa de preços (art. 23 da Lei nº 14.133/2021).</p>`,
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

      // Fundamento legal: fonte única do processo (licitacoes.fundamento_legal)
      const fundamento = textoDoFundamento(fundamentoEfetivo(licitacao as any));
      add(
        'fundamentacao',
        `${fundamento ? `<p>Fundamento legal: ${fundamento}.</p>` : ''}${necessidade || ''}`,
        necessidade ? 'ETP + fundamento legal do processo' : 'Fundamento legal do processo',
      );
      const solucaoEtp = this.secaoDe(docs, ETP, 'solucao');
      if (solucaoEtp.trim()) {
        add('descricao', solucaoEtp, 'ETP');
      } else if ((licitacao.itens || []).length) {
        // ETP "não se aplica" (art. 72, I) ou sem a solução: a solução é o objeto com os itens do processo
        add(
          'descricao',
          `<p>A solução compreende ${licitacao.objeto}, conforme os itens, as quantidades e as unidades relacionados na tabela de itens deste termo de referência.</p>`,
          'Processo (itens)',
        );
      }
      add('requisitos', this.secaoDe(docs, ETP, 'requisitos'), 'ETP');

      // Gestão e fiscalização (alínea f): o fiscal e o responsável sugeridos no DFD
      const dfdCampos = docs.find((d) => d.tipo === TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA)?.dados_estruturados?._dfd;
      if (dfdCampos?.fiscal_sugerido_nome || dfdCampos?.responsavel_nome) {
        add(
          'modelo_gestao',
          '<p>A execução do contrato será acompanhada e fiscalizada por representante da Administração especialmente designado (art. 117 da Lei nº 14.133/2021).</p><ul>' +
            (dfdCampos.fiscal_sugerido_nome ? `<li>Fiscal sugerido no DFD: ${dfdCampos.fiscal_sugerido_nome}</li>` : '') +
            (dfdCampos.responsavel_nome ? `<li>Responsável pela demanda (DFD): ${dfdCampos.responsavel_nome}${dfdCampos.unidade_requisitante_nome ? ` — ${dfdCampos.unidade_requisitante_nome}` : ''}</li>` : '') +
            '</ul>',
          'DFD',
        );
      }

      // Forma e critérios de seleção (alínea h): lidos do processo (modalidade, fundamento, critério, disputa)
      const modalidade = String(licitacao.modalidade);
      const direta = ['DISPENSA_ELETRONICA', 'INEXIGIBILIDADE'].includes(modalidade);
      const disputa = modalidade === 'DISPENSA_ELETRONICA' ? modoDisputaDaDispensa(licitacao as any, null) : null;
      add(
        'selecao_habilitacao',
        `<p>Forma de seleção do fornecedor: ${rotuloModalidade(modalidade)}${fundamento ? `, com fundamento na ${fundamento}` : ''}.</p>` +
          (modalidade === 'INEXIGIBILIDADE'
            ? ''
            : `<p>Critério de julgamento: ${rotuloCriterio((licitacao as any).criterio_julgamento ?? 'MENOR_PRECO')}${!direta && (licitacao as any).modo_disputa ? `; modo de disputa ${rotuloModoDisputa((licitacao as any).modo_disputa)}` : ''}.</p>`) +
          (disputa?.aplica && ['ESCOLHA', 'PROCESSO'].includes(disputa.fonte) ? `<p>${textoFormaDisputa(disputa.com_lances)}</p>` : '') +
          `<p>Habilitação: serão exigidos os documentos de habilitação jurídica, fiscal, social e trabalhista e, quando for o caso, técnica e econômico-financeira, nos termos dos arts. 62 a 70 da Lei nº 14.133/2021${direta ? ', observado o art. 72, V' : ''}.</p>`,
        'Processo',
      );

      // Estimativa: respeita o orçamento sigiloso (art. 24) — o TR vai para os
      // anexos do aviso, então no sigilo o valor não aparece no texto
      // Valor (alínea i): o da PESQUISA quando ela existe (art. 23) — nunca a
      // estimativa inicial que o ETP registrou antes da pesquisa
      const sigiloso = (licitacao as any).sigilo_orcamento === 'SIGILOSO';
      const estimativaValor = this.secaoDe(docs, ETP, 'estimativa_valor');
      if (sigiloso) {
        add(
          'estimativa_valor_tr',
          `<p>O orçamento estimado da contratação é SIGILOSO, nos termos do art. 24 da Lei nº 14.133/2021, e será tornado público apenas após o julgamento das propostas. O valor consta dos autos, com acesso restrito aos órgãos de controle.</p>`,
          'Processo (sigilo — art. 24)',
        );
      } else if (pesquisaConcluida && valorProcesso > 0) {
        add('estimativa_valor_tr', textoValorPesquisa(valorProcesso), 'Pesquisa de preços');
      } else if (estimativaValor && estimativaValor.trim() && !ESTIMATIVA_AUTOMATICA_ANTIGA.test(estimativaValor.trim())) {
        add('estimativa_valor_tr', estimativaValor, 'ETP');
      } else if (valorProcesso > 0) {
        add(
          'estimativa_valor_tr',
          `<p>Valor total estimado preliminarmente em ${BRL.format(valorProcesso)}, a ser confirmado pela pesquisa de preços (art. 23 da Lei nº 14.133/2021).</p>`,
          'Processo',
        );
      }

      // Adequação orçamentária: da RESERVA do processo (tabela de dotações)
      const [reserva] = await this.documentoRepository.manager
        .query(
          `SELECT id::text AS id, status, unidade_orcamentaria, programa, projeto_atividade, elemento_despesa, fonte_recurso
             FROM reservas_orcamentarias WHERE licitacao_id::text = $1 AND versao_atual = true`,
          [licitacaoId],
        )
        .catch(() => []);
      if (reserva?.projeto_atividade) {
        const linhas: Array<{ exercicio: number; valor: string; situacao: string }> = await this.documentoRepository.manager
          .query(`SELECT exercicio, valor, situacao FROM reservas_orcamentarias_linhas WHERE reserva_id::text = $1 ORDER BY exercicio`, [reserva.id])
          .catch(() => []);
        add(
          'dotacao_orcamentaria_tr',
          '<p>As despesas decorrentes desta contratação correrão à conta da seguinte dotação orçamentária:</p><ul>' +
            `<li>Unidade orçamentária: ${reserva.unidade_orcamentaria ?? '—'}</li>` +
            (reserva.programa ? `<li>Programa: ${reserva.programa}</li>` : '') +
            `<li>Projeto/atividade: ${reserva.projeto_atividade}</li>` +
            `<li>Elemento de despesa: ${reserva.elemento_despesa ?? '—'}</li>` +
            `<li>Fonte de recurso: ${reserva.fonte_recurso ?? '—'}</li>` +
            '</ul>' +
            (linhas.length && !sigiloso
              ? '<p>Distribuição por exercício:</p><ul>' +
                linhas.map((l) => `<li>${l.exercicio}: ${BRL.format(Number(l.valor))} (${l.situacao === 'RESERVADO' ? 'reservado' : 'previsão'})</li>`).join('') +
                '</ul>'
              : ''),
          `Reserva orçamentária (${reserva.status === 'EMITIDA' ? 'emitida' : 'em preparação'})`,
        );
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
    opcoes: { atualizarDerivadas?: boolean } = {},
  ): Promise<{ ok: true; dados_estruturados: Record<string, string>; atualizadas: string[] }> {
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

    const dados = (documento.dados_estruturados as Record<string, any>) || {};
    // Impressão de cada seção que o SISTEMA escreveu: ao regerar, a seção
    // derivada e intocada acompanha o processo (valor da pesquisa, reserva,
    // fundamento); a editada pelo usuário nunca é sobrescrita.
    const derivadas: Record<string, string> = { ...(dados._derivadas && typeof dados._derivadas === 'object' ? dados._derivadas : {}) };
    const atualizadas: string[] = [];

    for (const secaoId of secoesIds) {
      const entrada = seed.secoes[secaoId];
      if (!entrada) continue;
      const atual = dados[secaoId];
      const vazio = !atual || (typeof atual === 'string' && !atual.trim());
      const pode = sobrescrever || vazio || (!!opcoes.atualizarDerivadas && secaoDerivadaIntocada(atual, secaoId, derivadas));
      if (pode) {
        if (dados[secaoId] !== entrada.html) atualizadas.push(secaoId);
        dados[secaoId] = entrada.html;
        derivadas[secaoId] = hashSecao(entrada.html);
      }
    }
    dados._derivadas = derivadas;

    documento.dados_estruturados = dados;
    documento.descricao = Object.values(dados)
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');

    await this.documentoRepository.save(documento);
    return { ok: true, dados_estruturados: dados, atualizadas };
  }
}
