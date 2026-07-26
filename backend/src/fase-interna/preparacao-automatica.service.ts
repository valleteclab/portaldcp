import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DocumentoFaseInterna,
  TipoDocumentoFaseInterna,
  StatusDocumento,
  OrigemDocumento,
} from './entities/documento-fase-interna.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { FaseInternaService } from './fase-interna.service';
import { PesquisaPrecosAgentService } from './pesquisa-precos-agent.service';
import { IaService } from '../ia/ia.service';

/**
 * MODO CO-WORK (copiloto) — prepara o processo INTEIRO e deixa tudo
 * SUGERIDO para revisão humana:
 *   1. Pesquisa de preços com fontes REAIS (agente PNCP/Painel, cotações
 *      aprovadas como sugestão);
 *   2. Rascunhos IA dos documentos da instrução (ETP, TR, autorização —
 *      e DFD quando o processo não nasceu de uma demanda);
 *   3. Status/progresso gravado em licitacao.preparacao_automatica (o
 *      cockpit acompanha e avisa quando estiver pronto p/ revisão).
 * A responsabilidade continua com o servidor: nada é aprovado sozinho.
 */

// Seções por tipo (versão compacta do template do frontend —
// frontend/src/lib/fase-interna/secoes-template.ts é a fonte de verdade
// da UI; aqui só o necessário para gerar os rascunhos no servidor).
const SECOES_COPILOTO: Record<string, Array<{ id: string; titulo: string; fundamento: string }>> = {
  DFD: [
    { id: 'demanda', titulo: 'Descrição da necessidade', fundamento: 'Art. 18, I' },
    { id: 'quantidade', titulo: 'Quantidade estimada', fundamento: 'Art. 18, I' },
    { id: 'previsao', titulo: 'Previsão no PCA', fundamento: 'Art. 12, §1º' },
    { id: 'data', titulo: 'Data prevista de conclusão', fundamento: 'Art. 18, I' },
  ],
  ETP: [
    { id: 'necessidade', titulo: 'Descrição da necessidade (inc. I)', fundamento: 'Art. 18, §1º, I' },
    { id: 'previsao_pca', titulo: 'Previsão no PCA (inc. II)', fundamento: 'Art. 18, §1º, II' },
    { id: 'requisitos', titulo: 'Requisitos da contratação (inc. III)', fundamento: 'Art. 18, §1º, III' },
    { id: 'estimativa', titulo: 'Estimativa de quantidades (inc. IV)', fundamento: 'Art. 18, §1º, IV' },
    { id: 'levantamento', titulo: 'Levantamento de mercado (inc. V)', fundamento: 'Art. 18, §1º, V' },
    { id: 'estimativa_valor', titulo: 'Estimativa de valor referencial (inc. VI)', fundamento: 'Art. 18, §1º, VI' },
    { id: 'solucao', titulo: 'Descrição da solução escolhida (inc. VII)', fundamento: 'Art. 18, §1º, VII' },
    { id: 'parcelamento', titulo: 'Parcelamento ou não (inc. VIII)', fundamento: 'Art. 18, §1º, VIII' },
    { id: 'beneficios', titulo: 'Resultados e benefícios esperados (inc. IX)', fundamento: 'Art. 18, §1º, IX' },
    { id: 'providencias', titulo: 'Providências prévias (inc. X)', fundamento: 'Art. 18, §1º, X' },
    { id: 'correlatas', titulo: 'Contratações correlatas (inc. XI)', fundamento: 'Art. 18, §1º, XI' },
    { id: 'sustentabilidade', titulo: 'Impactos ambientais e sustentabilidade (inc. XII)', fundamento: 'Art. 18, §1º, XII' },
    { id: 'viabilidade', titulo: 'Posicionamento conclusivo (inc. XIII)', fundamento: 'Art. 18, §1º, XIII' },
  ],
  TR: [
    { id: 'objeto', titulo: 'Objeto', fundamento: 'Art. 6º, XXIII, a' },
    { id: 'fundamentacao', titulo: 'Fundamentação e justificativa', fundamento: 'Art. 6º, XXIII, b' },
    { id: 'descricao', titulo: 'Descrição da solução', fundamento: 'Art. 6º, XXIII, c' },
    { id: 'requisitos', titulo: 'Requisitos da contratação', fundamento: 'Art. 6º, XXIII, d' },
    { id: 'modelo_execucao', titulo: 'Modelo de execução do objeto', fundamento: 'Art. 6º, XXIII, e' },
    { id: 'modelo_gestao', titulo: 'Modelo de gestão e fiscalização', fundamento: 'Art. 6º, XXIII, f' },
    { id: 'pagamento', titulo: 'Critérios de medição e pagamento', fundamento: 'Art. 6º, XXIII, g' },
    { id: 'selecao_habilitacao', titulo: 'Critérios de seleção e habilitação', fundamento: 'Art. 6º, XXIII, h' },
    { id: 'estimativa_valor_tr', titulo: 'Estimativa de valor e sigilo', fundamento: 'Art. 6º, XXIII, i' },
    { id: 'dotacao_orcamentaria_tr', titulo: 'Adequação orçamentária', fundamento: 'Art. 6º, XXIII, j' },
  ],
  AA: [{ id: 'autorizacao', titulo: 'Autorização da Autoridade Competente', fundamento: 'Art. 18, II' }],
};

const TIPO_ENUM: Record<string, TipoDocumentoFaseInterna> = {
  DFD: TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA,
  ETP: TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR,
  TR: TipoDocumentoFaseInterna.TERMO_REFERENCIA,
  AA: TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA,
};

const TITULO_TIPO: Record<string, string> = {
  DFD: 'Documento de Formalização da Demanda (DFD)',
  ETP: 'Estudo Técnico Preliminar (ETP)',
  TR: 'Termo de Referência (TR)',
  AA: 'Autorização para Abertura',
};

interface StatusPreparacao {
  status: 'EXECUTANDO' | 'CONCLUIDA' | 'ERRO';
  etapa?: string;
  iniciada_em?: string;
  concluida_em?: string;
  log?: string[];
  erro?: string;
}

@Injectable()
export class PreparacaoAutomaticaService {
  private readonly logger = new Logger(PreparacaoAutomaticaService.name);

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(DocumentoFaseInterna)
    private readonly documentoRepository: Repository<DocumentoFaseInterna>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
    private readonly faseInternaService: FaseInternaService,
    private readonly pesquisaPrecosAgentService: PesquisaPrecosAgentService,
    private readonly iaService: IaService,
  ) {}

  /** Dispara a preparação (assíncrona) e retorna imediatamente. */
  async iniciar(licitacaoId: string): Promise<{ iniciada: boolean; ja_executando?: boolean }> {
    const lic = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!lic) throw new NotFoundException('Licitação não encontrada');

    const atual = (lic as any).preparacao_automatica as StatusPreparacao | null;
    if (atual?.status === 'EXECUTANDO') {
      return { iniciada: false, ja_executando: true };
    }

    await this.salvarStatus(licitacaoId, {
      status: 'EXECUTANDO',
      etapa: 'Iniciando a preparação…',
      iniciada_em: new Date().toISOString(),
      log: [],
    });

    // Fire-and-forget: o cockpit acompanha pelo status
    this.executar(licitacaoId).catch(async (e) => {
      this.logger.error(`[copiloto] falha na preparação da licitação ${licitacaoId}: ${e.message}`);
      await this.salvarStatus(licitacaoId, {
        status: 'ERRO',
        erro: String(e.message || e).slice(0, 300),
        concluida_em: new Date().toISOString(),
      }).catch(() => undefined);
    });

    return { iniciada: true };
  }

  private async salvarStatus(licitacaoId: string, patch: Partial<StatusPreparacao>): Promise<StatusPreparacao> {
    const lic = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    const atual = ((lic as any)?.preparacao_automatica as StatusPreparacao) || { status: 'EXECUTANDO', log: [] };
    const novo: StatusPreparacao = { ...atual, ...patch, log: patch.log ?? atual.log };
    await this.licitacaoRepository.update(licitacaoId, { preparacao_automatica: novo } as any);
    return novo;
  }

  private async executar(licitacaoId: string): Promise<void> {
    const lic = await this.licitacaoRepository.findOne({ where: { id: licitacaoId }, relations: ['orgao'] });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const itens = await this.itemRepository.find({
      where: { licitacao_id: licitacaoId } as any,
      order: { numero_item: 'ASC' } as any,
    });
    const log: string[] = [];
    const marcar = async (etapa: string) => {
      this.logger.log(`[copiloto] ${lic.numero_processo}: ${etapa}`);
      await this.salvarStatus(licitacaoId, { etapa, log: [...log] });
    };

    // ── 1. Pesquisa de preços com fontes REAIS (PNCP/Painel) ────────────────
    await marcar('Pesquisando preços no PNCP e Painel de Preços (fontes reais)…');
    try {
      const exec = await this.pesquisaPrecosAgentService.executar(licitacaoId, {
        iniciadoPorNome: 'Copiloto IA',
      });
      let aprovadas = 0;
      for (const cand of exec?.candidatos || []) {
        try {
          await this.pesquisaPrecosAgentService.aprovarCandidato(licitacaoId, (cand as any).id, {
            nome: 'Copiloto IA',
          });
          aprovadas++;
        } catch {
          /* candidato inválido/duplicado — ignora */
        }
      }
      await this.faseInternaService.removerCotacoesEstimadasDoAgente(licitacaoId);
      log.push(
        aprovadas > 0
          ? `Pesquisa de preços: ${aprovadas} cotação(ões) de fontes reais (PNCP/Painel) incluídas para revisão`
          : 'Pesquisa de preços: nenhuma cotação encontrada automaticamente — complete manualmente',
      );
    } catch (e: any) {
      log.push(`Pesquisa de preços não concluída (${String(e.message).slice(0, 80)}) — rode manualmente na tela de preços`);
    }

    // ── 2. Rascunhos IA dos documentos da instrução ─────────────────────────
    for (const tipo of ['DFD', 'ETP', 'TR', 'AA']) {
      await marcar(`Redigindo rascunho: ${TITULO_TIPO[tipo]}…`);
      try {
        const resultado = await this.gerarDocumento(lic, itens, tipo);
        if (resultado === 'ja_tinha') {
          log.push(`${TITULO_TIPO[tipo]}: mantido (já tinha conteúdo do usuário)`);
        } else {
          log.push(`${TITULO_TIPO[tipo]}: rascunho gerado — revise antes de aprovar`);
        }
      } catch (e: any) {
        log.push(`${TITULO_TIPO[tipo]}: não gerado (${String(e.message).slice(0, 80)}) — use "Gerar com IA" no editor`);
      }
    }

    await this.salvarStatus(licitacaoId, {
      status: 'CONCLUIDA',
      etapa: 'Pronto para revisão',
      concluida_em: new Date().toISOString(),
      log,
    });
    this.logger.log(`[copiloto] ${lic.numero_processo}: preparação concluída (${log.length} passo(s))`);
  }

  /** Gera o rascunho de um documento (JSON por seção) — não sobrescreve conteúdo humano. */
  private async gerarDocumento(
    lic: Licitacao,
    itens: ItemLicitacao[],
    tipo: string,
  ): Promise<'gerado' | 'ja_tinha'> {
    const tipoEnum = TIPO_ENUM[tipo];
    const secoes = SECOES_COPILOTO[tipo];

    const existente = await this.documentoRepository.findOne({
      where: { licitacao_id: lic.id, tipo: tipoEnum, versao_atual: true },
    });
    const dadosExistentes = (existente?.dados_estruturados as Record<string, unknown>) || {};
    const temConteudo =
      Object.values(dadosExistentes).some(
        (v) => typeof v === 'string' && v.replace(/<[^>]+>/g, '').trim().length > 10,
      ) || (existente?.descricao || '').replace(/<[^>]+>/g, '').trim().length > 20;
    if (temConteudo) return 'ja_tinha';

    const listaItens = itens
      .slice(0, 30)
      .map(
        (i) =>
          `${i.numero_item}. ${i.descricao_resumida || '—'} — ${Number(i.quantidade) || 1} ${i.unidade_medida || 'UN'}` +
          (i.valor_unitario_estimado ? ` × R$ ${Number(i.valor_unitario_estimado).toLocaleString('pt-BR')}` : ''),
      )
      .join('\n');
    const chaves = secoes.map((s) => `"${s.id}":"..."`).join(',');
    const guiaSecoes = secoes.map((s) => `- ${s.id}: ${s.titulo} (${s.fundamento})`).join('\n');

    const prompt =
      `Você é especialista sênior em contratações públicas (Lei nº 14.133/2021). ` +
      `Redija o ${TITULO_TIPO[tipo]} do processo abaixo, seção por seção.\n\n` +
      `Processo: ${lic.numero_processo}\nÓrgão: ${(lic as any).orgao?.nome || '—'}\n` +
      `Objeto: ${lic.objeto}\nModalidade: ${lic.modalidade} · Critério: ${lic.criterio_julgamento}\n` +
      `Valor total estimado: R$ ${Number(lic.valor_total_estimado || 0).toLocaleString('pt-BR')}\n` +
      (listaItens ? `Itens:\n${listaItens}\n` : '') +
      `\nSeções a redigir:\n${guiaSecoes}\n\n` +
      `REGRAS: texto formal e fundamentado, 2-4 frases por seção (seções de autorização/justificativa podem ter mais); ` +
      `NUNCA use placeholders como [PREENCHER]; quando faltar dado institucional use "(a confirmar pelo órgão)". ` +
      `Responda APENAS com JSON válido no formato {${chaves}} — valores em texto puro (sem HTML).`;

    const resposta = await this.iaService.chat([{ role: 'user', content: prompt }], tipo);
    const json = this.extrairJson(resposta);
    if (!json) throw new Error('IA não retornou JSON válido');

    const dados: Record<string, string> = {};
    for (const s of secoes) {
      const v = json[s.id];
      if (typeof v === 'string' && v.trim()) dados[s.id] = `<p>${v.trim().replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
    }
    if (Object.keys(dados).length === 0) throw new Error('IA não preencheu nenhuma seção');
    (dados as any)._sugerido_copiloto = new Date().toISOString();

    const descricao = secoes
      .filter((s) => dados[s.id])
      .map((s) => dados[s.id])
      .join('\n');

    if (existente) {
      existente.dados_estruturados = { ...dadosExistentes, ...dados };
      existente.descricao = descricao;
      if (existente.status === StatusDocumento.PENDENTE) existente.status = StatusDocumento.EM_ELABORACAO;
      await this.documentoRepository.save(existente);
    } else {
      await this.documentoRepository.save(
        this.documentoRepository.create({
          licitacao_id: lic.id,
          tipo: tipoEnum,
          titulo: TITULO_TIPO[tipo],
          descricao,
          dados_estruturados: dados,
          status: StatusDocumento.EM_ELABORACAO,
          origem: OrigemDocumento.INTERNO,
          versao: 1,
          versao_atual: true,
          criado_por_nome: 'Copiloto IA',
        }),
      );
    }
    return 'gerado';
  }

  private extrairJson(texto: string): Record<string, unknown> | null {
    const inicio = texto.indexOf('{');
    const fim = texto.lastIndexOf('}');
    if (inicio < 0 || fim <= inicio) return null;
    const candidato = texto.slice(inicio, fim + 1);
    try {
      return JSON.parse(candidato);
    } catch {
      // tenta limpar cercas de código e vírgulas finais
      try {
        return JSON.parse(candidato.replace(/```(json)?/g, '').replace(/,\s*}/g, '}'));
      } catch {
        return null;
      }
    }
  }
}
