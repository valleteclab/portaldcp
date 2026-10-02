import { modoDisputaDaDispensa, textoFormaDisputa } from '../licitacoes/modo-disputa-dispensa';
import { definicaoDoFundamento, fundamentoEfetivo, incisoLimiteDoFundamento, textoDoFundamento } from '../licitacoes/fundamento-legal';
import { limiteDispensa } from '../parametros-licitacao/limites-dispensa';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { ModeloDocumento, SecaoModelo } from './entities/modelo-documento.entity';
import {
  DocumentoFaseInterna,
  TipoDocumentoFaseInterna,
} from './entities/documento-fase-interna.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { FaseInternaService } from './fase-interna.service';
import {
  MODELOS_PADRAO,
  CABECALHO_PADRAO_HTML,
  RODAPE_PADRAO_HTML,
  AUTORIZACAO_TEXTO_E1,
  MINUTA_AVISO_PREAMBULO_ANTIGO,
  TEXTOS_SUBSTITUIDOS_HOMOLOGACAO,
} from './modelos-padrao';
import { MODELOS_PADRAO_PROCESSO } from '../processo/modelos-peca-padrao';
import {
  dataPorExtensoBrasilia,
  localDoOrgao,
  localEData,
  rotuloCriterio,
  rotuloModalidade,
  rotuloModoDisputa,
  substituirVariaveis,
  valorCadastral,
} from './textos-documento';

/**
 * Modelos de documento personalizáveis por órgão (estilo SEI).
 *
 * Resolução: modelo ativo do órgão para o tipo → modelo padrão do sistema.
 * O seed dos modelos padrão roda no bootstrap (idempotente).
 */
/**
 * Textos padrão ANTIGOS de seções de modelos do sistema (substituídos pela
 * versão que lê o fundamento legal do processo — Entrega 1 da fase interna).
 */
const TEXTOS_PADRAO_LEGADOS: string[] = [
  '<p>Considerando a instrução do Processo Administrativo nº {{licitacao.numero_processo}}, AUTORIZO a abertura do procedimento licitatório destinado a {{licitacao.objeto}}, nos termos do Art. 18, II, da Lei nº 14.133/2021.</p><p>{{orgao.cidade}}, {{data_atual}}.</p>',
  // Entrega 3B: despacho com teto e dotação; minuta do aviso também para a contratação direta
  AUTORIZACAO_TEXTO_E1,
  MINUTA_AVISO_PREAMBULO_ANTIGO,
  // Homologação (26/09/2026): local/data sem "A definir", agente sem repetir o cargo, foro
  ...TEXTOS_SUBSTITUIDOS_HOMOLOGACAO,
];

@Injectable()
export class ModeloDocumentoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ModeloDocumentoService.name);

  constructor(
    @InjectRepository(ModeloDocumento)
    private readonly modeloRepo: Repository<ModeloDocumento>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    @InjectRepository(Orgao)
    private readonly orgaoRepo: Repository<Orgao>,
    @InjectRepository(DocumentoFaseInterna)
    private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly faseInterna: FaseInternaService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seedModelosPadrao();
    } catch (e) {
      this.logger.error(`Falha ao semear modelos padrão: ${e.message}`);
    }
  }

  /** Cria os modelos padrão do sistema que ainda não existem (idempotente). */
  async seedModelosPadrao(): Promise<{ criados: number }> {
    let criados = 0;
    for (const def of [...MODELOS_PADRAO, ...MODELOS_PADRAO_PROCESSO]) {
      const existente = await this.modeloRepo.findOne({
        where: { orgao_id: IsNull(), tipo: def.tipo, padrao_sistema: true },
      });
      if (existente) {
        // Modelo do SISTEMA já semeado: o texto padrão de uma seção acompanha o
        // código quando ainda é o texto antigo do sistema (ou vazio) — o órgão
        // que personalizou tem modelo próprio (orgao_id) e não é tocado.
        let mudou = false;
        const secoes = (existente.secoes || []).map((sec) => {
          const def_sec = def.secoes.find((d) => d.id === sec.id);
          if (!def_sec?.texto_padrao || sec.texto_padrao === def_sec.texto_padrao) return sec;
          if (sec.texto_padrao && !TEXTOS_PADRAO_LEGADOS.includes(sec.texto_padrao)) return sec;
          mudou = true;
          return { ...sec, texto_padrao: def_sec.texto_padrao };
        });
        if (mudou) await this.modeloRepo.update(existente.id, { secoes });
        continue;
      }
      await this.modeloRepo.save(
        this.modeloRepo.create({
          orgao_id: null as any,
          tipo: def.tipo,
          nome: def.nome,
          fundamento_legal: def.fundamento_legal,
          intro: def.intro,
          secoes: def.secoes,
          cabecalho_html: CABECALHO_PADRAO_HTML,
          rodape_html: RODAPE_PADRAO_HTML,
          padrao_sistema: true,
          ativo: true,
        }),
      );
      criados++;
    }
    if (criados > 0) this.logger.log(`Modelos padrão semeados: ${criados}`);
    return { criados };
  }

  /** Lista modelos visíveis para um órgão: os dele + os padrão do sistema. */
  async listar(orgaoId?: string, tipo?: TipoDocumentoFaseInterna) {
    const qb = this.modeloRepo
      .createQueryBuilder('m')
      .where('(m.orgao_id IS NULL OR m.orgao_id = :orgaoId)', { orgaoId: orgaoId || null })
      .orderBy('m.tipo', 'ASC')
      .addOrderBy('m.orgao_id', 'DESC', 'NULLS LAST')
      .addOrderBy('m.updated_at', 'DESC');
    if (tipo) qb.andWhere('m.tipo = :tipo', { tipo });
    return qb.getMany();
  }

  async obter(id: string): Promise<ModeloDocumento> {
    const modelo = await this.modeloRepo.findOne({ where: { id } });
    if (!modelo) throw new NotFoundException('Modelo de documento não encontrado');
    return modelo;
  }

  /**
   * Resolve o modelo efetivo para um tipo de documento:
   * modelo ativo do órgão → modelo padrão do sistema → null.
   */
  async resolverModelo(
    orgaoId: string | null,
    tipo: TipoDocumentoFaseInterna,
  ): Promise<ModeloDocumento | null> {
    if (orgaoId) {
      const doOrgao = await this.modeloRepo.findOne({
        where: { orgao_id: orgaoId, tipo, ativo: true },
        order: { updated_at: 'DESC' },
      });
      if (doOrgao) return doOrgao;
    }
    return this.modeloRepo.findOne({
      where: { orgao_id: IsNull(), tipo, ativo: true },
      order: { padrao_sistema: 'DESC', updated_at: 'DESC' },
    });
  }

  async criar(dados: Partial<ModeloDocumento>): Promise<ModeloDocumento> {
    if (!dados.orgao_id) {
      throw new BadRequestException('orgao_id é obrigatório para modelos personalizados');
    }
    if (!dados.tipo || !dados.nome) {
      throw new BadRequestException('tipo e nome são obrigatórios');
    }
    this.validarSecoes(dados.secoes || []);
    return this.modeloRepo.save(
      this.modeloRepo.create({ ...dados, padrao_sistema: false, versao: 1 }),
    );
  }

  /** Duplica um modelo (padrão ou próprio) para personalização pelo órgão. */
  async duplicar(
    id: string,
    orgaoId: string,
    usuario?: { id?: string; nome?: string },
  ): Promise<ModeloDocumento> {
    const origem = await this.obter(id);
    return this.modeloRepo.save(
      this.modeloRepo.create({
        orgao_id: orgaoId,
        tipo: origem.tipo,
        nome: `${origem.nome} (personalizado)`,
        descricao: origem.descricao,
        fundamento_legal: origem.fundamento_legal,
        intro: origem.intro,
        cabecalho_html: origem.cabecalho_html,
        rodape_html: origem.rodape_html,
        secoes: origem.secoes,
        padrao_sistema: false,
        ativo: true,
        versao: 1,
        criado_por_id: usuario?.id,
        criado_por_nome: usuario?.nome,
      }),
    );
  }

  async atualizar(id: string, dados: Partial<ModeloDocumento>): Promise<ModeloDocumento> {
    const modelo = await this.obter(id);
    if (modelo.padrao_sistema) {
      throw new BadRequestException(
        'Modelos padrão do sistema não podem ser editados. Duplique para personalizar.',
      );
    }
    if (dados.secoes) this.validarSecoes(dados.secoes);
    // Campos imutáveis
    delete (dados as any).id;
    delete (dados as any).orgao_id;
    delete (dados as any).padrao_sistema;
    Object.assign(modelo, dados, { versao: modelo.versao + 1 });
    return this.modeloRepo.save(modelo);
  }

  /** Desativa (soft delete) um modelo personalizado. */
  async desativar(id: string): Promise<ModeloDocumento> {
    const modelo = await this.obter(id);
    if (modelo.padrao_sistema) {
      throw new BadRequestException('Modelos padrão do sistema não podem ser removidos');
    }
    modelo.ativo = false;
    return this.modeloRepo.save(modelo);
  }

  /**
   * Instancia o conteúdo inicial de um documento a partir do modelo:
   * dados_estruturados = { secaoId: texto_padrao com variáveis resolvidas }.
   */
  async instanciarConteudo(
    modelo: ModeloDocumento,
    licitacaoId: string,
  ): Promise<{ dados: Record<string, string>; titulo: string }> {
    const contexto = await this.montarContextoVariaveis(licitacaoId);
    const dados: Record<string, string> = {};
    for (const secao of modelo.secoes || []) {
      dados[secao.id] = secao.texto_padrao
        ? this.substituirVariaveis(secao.texto_padrao, contexto)
        : '';
    }
    return { dados, titulo: modelo.nome };
  }

  /** Variáveis disponíveis nos modelos ({{orgao.nome}}, {{licitacao.objeto}}, …) */
  async montarContextoVariaveis(licitacaoId: string): Promise<Record<string, string>> {
    const licitacao = await this.licitacaoRepo.findOne({ where: { id: licitacaoId } });
    if (!licitacao) throw new NotFoundException('Licitação não encontrada');
    const orgao = licitacao.orgao_id
      ? await this.orgaoRepo.findOne({ where: { id: licitacao.orgao_id } })
      : null;

    const dataAtual = dataPorExtensoBrasilia();
    // Município do cadastro do órgão ("A definir" do cadastro incompleto = sem cidade)
    const local = localDoOrgao(orgao as any);

    const valor = Number(licitacao.valor_total_estimado || 0);
    const extras = await this.contextoDoProcesso(licitacao, valor).catch((e) => {
      this.logger.warn(`Variáveis do processo (3B) não montadas: ${e?.message ?? e}`);
      return {} as Record<string, string>;
    });
    return {
      'orgao.nome': valorCadastral(orgao?.nome),
      'orgao.cnpj': valorCadastral(orgao?.cnpj),
      'orgao.cidade': local,
      'orgao.local': local,
      // Art. 92, §1º: foro da sede da Administração
      'orgao.foro': local ? `o foro da sede da Administração, em ${local},` : 'o foro da sede da Administração',
      'licitacao.numero_processo': licitacao.numero_processo || '',
      'licitacao.numero_edital': licitacao.numero_edital || '',
      'licitacao.objeto': licitacao.objeto || '',
      // Rótulo legível — nunca o código interno (DISPENSA_ELETRONICA) no texto da peça
      'licitacao.modalidade': rotuloModalidade(licitacao.modalidade),
      'licitacao.modalidade_codigo': String(licitacao.modalidade || ''),
      'licitacao.criterio_julgamento': rotuloCriterio((licitacao as any).criterio_julgamento),
      'licitacao.modo_disputa': rotuloModoDisputa((licitacao as any).modo_disputa),
      // Fundamento legal: fonte única do processo (nunca texto livre da peça)
      'licitacao.fundamento_legal': textoDoFundamento(fundamentoEfetivo(licitacao)) || '',
      'licitacao.fundamento_referencia': definicaoDoFundamento(fundamentoEfetivo(licitacao))?.referencia || '',
      'licitacao.valor_estimado': valor
        ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '',
      data_atual: dataAtual,
      // "Cidade/UF, 26 de setembro de 2026" — sem município no cadastro, só a data
      local_data: localEData(local, dataAtual),
      ...extras,
    };
  }

  /**
   * VARIÁVEIS DO PROCESSO para as peças da etapa 6 e 7 (Entrega 3B — despacho
   * de autorização, relatório do agente, minutas do aviso e do contrato,
   * parecer). TUDO lido do processo (fonte única): número do PA e da
   * dispensa, fundamento, teto, sigilo (art. 24), dotação e leis da reserva,
   * autoridade da configuração, agente e portaria de designação do órgão.
   * Evita o erro real do PA 139/2025 (minuta com o "PA 115/2025" de outro processo).
   */
  private async contextoDoProcesso(licitacao: Licitacao, valorGravado: number): Promise<Record<string, string>> {
    const q = (sql: string, p: unknown[]) => this.licitacaoRepo.query(sql, p) as Promise<any[]>;
    const BRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const [soma] = await q(
      `SELECT COALESCE(SUM(COALESCE(valor_total_estimado, quantidade * COALESCE(valor_unitario_estimado, 0))), 0)::float AS total
         FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO'`,
      [licitacao.id],
    );
    const teto = Number(soma?.total) > 0 ? Number(soma.total) : valorGravado;
    const sigiloso = (licitacao as any).sigilo_orcamento === 'SIGILOSO';
    const [reserva] = await q(
      `SELECT r.status, r.unidade_orcamentaria, r.programa, r.projeto_atividade, r.elemento_despesa, r.fonte_recurso,
              ldo.numero AS ldo_numero, ldo.exercicio AS ldo_exercicio, loa.numero AS loa_numero, loa.exercicio AS loa_exercicio,
              (SELECT json_agg(json_build_object('exercicio', l.exercicio, 'valor', l.valor, 'situacao', l.situacao) ORDER BY l.exercicio)
                 FROM reservas_orcamentarias_linhas l WHERE l.reserva_id = r.id) AS linhas
         FROM reservas_orcamentarias r
         LEFT JOIN leis_orcamentarias ldo ON ldo.id = r.lei_ldo_id
         LEFT JOIN leis_orcamentarias loa ON loa.id = r.lei_loa_id
        WHERE r.licitacao_id::text = $1 AND r.versao_atual = true LIMIT 1`,
      [licitacao.id],
    ).catch(() => []);
    const dotacao = reserva?.projeto_atividade
      ? [reserva.unidade_orcamentaria, reserva.programa ? `Programa ${reserva.programa}` : null, `Projeto/atividade ${reserva.projeto_atividade}`, `Elemento ${reserva.elemento_despesa}`, `Fonte ${reserva.fonte_recurso}`]
          .filter(Boolean)
          .join(', ')
      : 'a indicar pela Contabilidade (reserva ainda não emitida)';
    const leis = [
      reserva?.loa_numero ? `a Lei Orçamentária Anual (Lei nº ${reserva.loa_numero}/${reserva.loa_exercicio})` : null,
      reserva?.ldo_numero ? `a Lei de Diretrizes Orçamentárias (Lei nº ${reserva.ldo_numero}/${reserva.ldo_exercicio})` : null,
    ].filter(Boolean);
    const [cfg] = licitacao.orgao_id
      ? await q(`SELECT autoridade_rotulo, dispensa_com_lances FROM configuracoes_fase_interna WHERE orgao_id::text = $1`, [licitacao.orgao_id]).catch(() => [])
      : [];
    // Agente de contratação: o designado no processo; senão, o ÚNICO usuário
    // ativo do órgão com o papel "Agente de contratação" (Configurações › papéis).
    let [agente] = (licitacao as any).pregoeiro_id
      ? await q(`SELECT nome, cargo FROM usuarios WHERE id::text = $1`, [String((licitacao as any).pregoeiro_id)]).catch(() => [])
      : [];
    if (!agente?.nome && licitacao.orgao_id) {
      const candidatos = await q(
        `SELECT nome, cargo FROM usuarios WHERE orgao_id::text = $1 AND ativo = true AND papeis_fase_interna @> '["AGENTE_CONTRATACAO"]'::jsonb LIMIT 2`,
        [licitacao.orgao_id],
      ).catch(() => []);
      if (candidatos.length === 1) agente = candidatos[0];
    }
    const nomeAgente = valorCadastral(agente?.nome);
    const cargoAgente = valorCadastral(agente?.cargo);
    // Portaria de designação: a peça DP do processo, senão a portaria ativa do órgão no exercício
    const exercicio = Number((licitacao as any).ano) || new Date((licitacao as any).created_at ?? Date.now()).getFullYear();
    const [dp] = await q(
      `SELECT numero_peca FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = 'DP' AND versao_atual = true AND numero_peca IS NOT NULL LIMIT 1`,
      [licitacao.id],
    ).catch(() => []);
    const [portaria] = !dp && licitacao.orgao_id
      ? await q(
          `SELECT numero FROM documentos_orgao WHERE orgao_id::text = $1 AND tipo::text = 'PORTARIA_DESIGNACAO' AND ativo = true AND exercicio = $2 ORDER BY versao DESC LIMIT 1`,
          [licitacao.orgao_id, exercicio],
        ).catch(() => [])
      : [];
    const numeroPortaria = dp?.numero_peca || portaria?.numero || null;
    const designacao = numeroPortaria ? `designado pela ${numeroPortaria}` : 'designado por portaria do órgão';
    // Limite do inciso do fundamento (art. 75, I/II) no exercício — o do INCISO CERTO (PA 139/2025)
    const inciso = incisoLimiteDoFundamento(fundamentoEfetivo(licitacao));
    const limite = inciso ? limiteDispensa(exercicio, inciso) : null;
    return {
      'licitacao.limite_dispensa': limite
        ? `${BRL(limite.valor)} (art. 75, ${inciso}, valor atualizado pelo ${limite.ato_normativo}${limite.provisorio ? ' — valor do último decreto publicado' : ''})`
        : 'não se aplica (hipótese sem limite de valor)',
      'licitacao.numero_dispensa': licitacao.numero_edital || '(número a atribuir na divulgação)',
      'licitacao.teto': teto ? BRL(teto) : 'a definir pela pesquisa de preços',
      'licitacao.valor_publico': sigiloso ? 'sigiloso (art. 24 da Lei nº 14.133/2021)' : teto ? BRL(teto) : 'a definir',
      'licitacao.sigilo': sigiloso
        ? `O orçamento estimado é SIGILOSO (art. 24 da Lei nº 14.133/2021)${(licitacao as any).justificativa_sigilo ? `: ${String((licitacao as any).justificativa_sigilo)}` : ''}, e será divulgado após o julgamento.`
        : 'O orçamento estimado é público.',
      // Dispensa com/sem etapa de lances (Entrega 5): configuração até publicar; depois, a do processo
      'licitacao.forma_disputa': (() => {
        const modo = modoDisputaDaDispensa(licitacao as any, cfg?.dispensa_com_lances);
        return modo.aplica
          ? textoFormaDisputa(modo.com_lances)
          : 'Critério de julgamento, modo de disputa e prazos conforme o edital (arts. 33, 56 e 55 da Lei nº 14.133/2021).';
      })(),
      'reserva.dotacao': dotacao,
      'reserva.situacao': reserva ? (reserva.status === 'EMITIDA' ? 'reservada' : 'em preparação') : 'sem reserva',
      // "2026: R$ 10.000,00 (reservado); 2027: R$ 12.600,00 (previsão)" — nunca "10000.00 (previsao)"
      'reserva.exercicios':
        (Array.isArray(reserva?.linhas) ? reserva.linhas : [])
          .map((l: any) => `${l.exercicio}: ${BRL(Number(l.valor))} (${String(l.situacao).toUpperCase() === 'RESERVADO' ? 'reservado' : 'previsão'})`)
          .join('; ') || '—',
      'reserva.leis': leis.length ? leis.join(' e ') : 'as leis orçamentárias do exercício',
      'autoridade.nome': String(cfg?.autoridade_rotulo ?? '').trim() || 'Autoridade competente',
      'agente.nome': nomeAgente || 'Agente de contratação',
      'agente.cargo': cargoAgente || 'Agente de contratação',
      'portaria.designacao': designacao,
      // Frase inteira (sem "Agente de contratação: Agente de contratação" quando falta o nome)
      'agente.identificacao': nomeAgente ? `Agente de contratação: ${nomeAgente}, ${designacao}` : `Agente de contratação ${designacao}`,
      'agente.assinatura': nomeAgente ? `${nomeAgente} — ${cargoAgente || 'Agente de contratação'}` : 'Agente de contratação',
    };
  }

  /**
   * Cria um documento da fase interna instanciado a partir do modelo efetivo
   * (ou de um modelo específico), com texto padrão e variáveis resolvidas.
   */
  async criarDocumentoDeModelo(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
    opcoes?: { modeloId?: string; criadorId?: string; criadorNome?: string },
  ): Promise<DocumentoFaseInterna> {
    const licitacao = await this.licitacaoRepo.findOne({ where: { id: licitacaoId } });
    if (!licitacao) throw new NotFoundException('Licitação não encontrada');

    const modelo = opcoes?.modeloId
      ? await this.obter(opcoes.modeloId)
      : await this.resolverModelo(licitacao.orgao_id, tipo);
    if (!modelo) {
      throw new NotFoundException(`Nenhum modelo disponível para o tipo ${tipo}`);
    }
    if (modelo.tipo !== tipo) {
      throw new BadRequestException('O modelo informado não corresponde ao tipo do documento');
    }

    const { dados, titulo } = await this.instanciarConteudo(modelo, licitacaoId);
    const documento = await this.faseInterna.criarDocumento(
      licitacaoId,
      tipo,
      titulo,
      modelo.intro,
      opcoes?.criadorId,
      opcoes?.criadorNome,
    );
    documento.dados_estruturados = dados;
    return this.docRepo.save(documento);
  }

  /**
   * Troca as variáveis do modelo. Variável sem dado (ou desconhecida — modelo
   * do órgão com um nome errado) sai como "—": nunca `{{…}}` cru na peça.
   */
  substituirVariaveis(texto: string, contexto: Record<string, string>): string {
    return substituirVariaveis(texto, contexto);
  }

  private validarSecoes(secoes: SecaoModelo[]) {
    const ids = new Set<string>();
    for (const s of secoes) {
      if (!s.id || !s.titulo) {
        throw new BadRequestException('Toda seção do modelo precisa de id e titulo');
      }
      if (ids.has(s.id)) {
        throw new BadRequestException(`Seção duplicada no modelo: ${s.id}`);
      }
      ids.add(s.id);
    }
  }
}
