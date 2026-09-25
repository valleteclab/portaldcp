import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager, In } from 'typeorm';
import { FaseLicitacao, Licitacao, ModalidadeLicitacao } from '../licitacoes/entities/licitacao.entity';
import { FASES_INTERNAS } from '../licitacoes/transicoes/fases';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { calendarioDoOrgao, fimDoPrazoEmDiasUteis } from '../common/prazos/dias-uteis';
import { diretorioDeGravacao } from '../common/arquivos/arquivos';
import {
  DialogoComissaoMembro,
  DialogoCompetitivo,
  DialogoDocumento,
  DialogoParticipante,
  DialogoReuniao,
} from './dialogo.entities';
import {
  DIAS_UTEIS_DECISAO_RECONSIDERACAO,
  DIAS_UTEIS_FASE_COMPETITIVA,
  DIAS_UTEIS_MANIFESTACAO,
  HIPOTESES_ART32,
  TAMANHO_MINIMO_MOTIVACAO,
  etapaEfetiva,
  minimoFaseCompetitiva,
  motivoDecisaoPreSelecaoInvalida,
  motivoPedidoReconsideracaoInvalido,
  prazoPedidoReconsideracao,
  pendenciasComissao,
  pendenciasInicioDialogo,
  validarConfiguracaoDialogo,
} from './regras-dialogo';

export type VisaoDialogo = { tipo: 'ORGAO' } | { tipo: 'FORNECEDOR'; fornecedorId: string } | { tipo: 'PUBLICO' };

export interface ArquivoEnviado {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export const PASTA_DIALOGO = 'dialogo-competitivo'; // SENSÍVEL
export const TAMANHO_MAXIMO_GRAVACAO = 200 * 1024 * 1024;
const MIMES_DOC = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/zip', 'application/x-zip-compressed'];
const MIMES_GRAVACAO = ['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'video/x-matroska'];

/**
 * ============================================================================
 * DIÁLOGO COMPETITIVO (Lei 14.133/2021 art. 32; plano E7c) — regras em
 * `regras-dialogo.ts`. SIGILO (§1º III e IV): o licitante só lê a própria
 * manifestação, as próprias reuniões (ata e gravação) e as próprias soluções;
 * o órgão dono lê tudo; o público vê o edital, a etapa e contagens.
 * ============================================================================
 */
@Injectable()
export class DialogoService {
  private readonly logger = new Logger(DialogoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly transicoes: TransicoesService,
  ) {}

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async licitacao(id: string, m: EntityManager = this.ds.manager): Promise<Licitacao> {
    const lic = await m.getRepository(Licitacao).findOne({ where: { id } });
    if (!lic || lic.modalidade !== ModalidadeLicitacao.DIALOGO_COMPETITIVO) throw new NotFoundException('Diálogo competitivo não encontrado');
    return lic;
  }

  private exigirAtiva(lic: Licitacao) {
    if (lic.situacao && lic.situacao !== 'ATIVA') throw new ConflictException(`Licitação ${String(lic.situacao).toLowerCase()} — ato não permitido`);
  }

  private async dialogo(licitacaoId: string, m: EntityManager = this.ds.manager): Promise<DialogoCompetitivo> {
    const d = await m.getRepository(DialogoCompetitivo).findOne({ where: { licitacao_id: licitacaoId } });
    if (!d) throw new ConflictException('Configure o diálogo competitivo (hipótese, necessidades, critérios de pré-seleção).');
    return d;
  }

  private gravarArquivo(licitacaoId: string, prefixo: string, a: ArquivoEnviado): { caminho: string; sha256: string; nome: string } {
    const ext = (path.extname(a.originalname || '').toLowerCase() || '.bin').replace(/[^.a-z0-9]/g, '');
    const nome = `${prefixo}-${randomUUID()}${ext}`;
    const dir = path.join(diretorioDeGravacao(PASTA_DIALOGO), licitacaoId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), a.buffer);
    return { caminho: `${PASTA_DIALOGO}/${licitacaoId}/${nome}`, sha256: createHash('sha256').update(a.buffer).digest('hex'), nome: String(a.originalname || nome).slice(0, 250) };
  }

  static caminhoFisico(logico: string | null | undefined): string | null {
    if (!logico || !logico.startsWith(`${PASTA_DIALOGO}/`) || logico.includes('..')) return null;
    const [, ...resto] = logico.split('/');
    const p = path.join(diretorioDeGravacao(PASTA_DIALOGO), ...resto);
    return fs.existsSync(p) ? p : null;
  }

  private async participanteDoFornecedor(licitacaoId: string, fornecedorId: string): Promise<DialogoParticipante | null> {
    return this.ds.getRepository(DialogoParticipante).findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId } });
  }

  private async nomes(ids: string[]): Promise<Map<string, string>> {
    const v = [...new Set(ids.filter(Boolean))];
    if (!v.length) return new Map();
    const rows: any[] = await this.ds.query(`SELECT id::text AS id, razao_social FROM fornecedores WHERE id::text = ANY($1)`, [v]);
    return new Map(rows.map((r) => [r.id, r.razao_social]));
  }

  // ==========================================================================
  // PAINEL (com sigilo por visão)
  // ==========================================================================

  async painel(licitacaoId: string, visao: VisaoDialogo) {
    const lic = await this.licitacao(licitacaoId);
    if (visao.tipo === 'PUBLICO' && FASES_INTERNAS.includes(lic.fase)) throw new NotFoundException('Diálogo competitivo não encontrado');
    const d = await this.ds.getRepository(DialogoCompetitivo).findOne({ where: { licitacao_id: licitacaoId } });
    const etapa = etapaEfetiva(d?.etapa, lic.fase);
    const comissao = await this.ds.getRepository(DialogoComissaoMembro).find({ where: { licitacao_id: licitacaoId }, order: { created_at: 'ASC' } });
    const participantes = await this.ds.getRepository(DialogoParticipante).find({ where: { licitacao_id: licitacaoId }, order: { manifestado_em: 'ASC' } });
    const meu = visao.tipo === 'FORNECEDOR' ? participantes.find((p) => p.fornecedor_id === visao.fornecedorId) ?? null : null;
    const idsVisiveis = visao.tipo === 'ORGAO' ? participantes.map((p) => p.id) : meu ? [meu.id] : [];
    const reunioes = idsVisiveis.length
      ? await this.ds.getRepository(DialogoReuniao).find({ where: { licitacao_id: licitacaoId, participante_id: In(idsVisiveis) }, order: { agendada_para: 'ASC' } })
      : [];
    const documentos = idsVisiveis.length
      ? await this.ds.getRepository(DialogoDocumento).find({ where: { licitacao_id: licitacaoId, participante_id: In(idsVisiveis) }, order: { created_at: 'ASC' } })
      : [];
    const nomes = visao.tipo === 'ORGAO' ? await this.nomes(participantes.map((p) => p.fornecedor_id)) : new Map<string, string>();
    const competitivaPublicada = !!d?.fase_competitiva_publicada_em;
    const pre = participantes.filter((p) => p.situacao === 'PRE_SELECIONADO').length;
    const cal = calendarioDoOrgao(lic.orgao_id ?? null);
    return {
      licitacao: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        objeto: lic.objeto,
        fase: lic.fase,
        situacao: lic.situacao,
        criterio_julgamento: lic.criterio_julgamento,
        modo_disputa: lic.modo_disputa,
        data_inicio_acolhimento: lic.data_inicio_acolhimento,
        data_fim_acolhimento: lic.data_fim_acolhimento,
        data_abertura_sessao: lic.data_abertura_sessao,
      },
      etapa,
      prazos: {
        manifestacaoDiasUteis: DIAS_UTEIS_MANIFESTACAO,
        faseCompetitivaDiasUteis: DIAS_UTEIS_FASE_COMPETITIVA,
        minimoFaseCompetitivaHoje: minimoFaseCompetitiva(new Date(), cal),
      },
      hipotesesDisponiveis: HIPOTESES_ART32,
      configuracao: d
        ? {
            hipoteses: d.hipoteses,
            justificativa_hipotese: d.justificativa_hipotese,
            necessidades: d.necessidades,
            exigencias_definidas: d.exigencias_definidas,
            criterios_preselecao: d.criterios_preselecao,
            fases_sucessivas: d.fases_sucessivas,
            dialogo_iniciado_em: d.dialogo_iniciado_em,
            dialogo_concluido_em: d.dialogo_concluido_em,
            // decisão fundamentada: pública depois da conclusão (sem revelar soluções de licitante)
            conclusao_motivacao: visao.tipo === 'ORGAO' || d.dialogo_concluido_em ? d.conclusao_motivacao : null,
            solucao_identificada: visao.tipo === 'ORGAO' || competitivaPublicada ? d.solucao_identificada : null,
            fase_competitiva_publicada_em: d.fase_competitiva_publicada_em,
            especificacao_solucao: visao.tipo === 'ORGAO' || competitivaPublicada ? d.especificacao_solucao : null,
            criterios_selecao: visao.tipo === 'ORGAO' || competitivaPublicada ? d.criterios_selecao : null,
            temEditalCompetitivo: !!d.edital_competitivo_caminho,
          }
        : null,
      comissao: comissao.map((c) => ({
        id: c.id,
        nome: c.nome,
        cargo: c.cargo,
        vinculo: c.vinculo,
        papel: c.papel,
        usuario_id: visao.tipo === 'ORGAO' ? c.usuario_id : null,
        termo_confidencialidade_em: c.termo_confidencialidade_em,
      })),
      pendenciasComissao: visao.tipo === 'ORGAO' ? pendenciasComissao(comissao) : [],
      pendenciasEdital: visao.tipo === 'ORGAO' && FASES_INTERNAS.includes(lic.fase) && d ? validarConfiguracaoDialogo(d) : [],
      pendenciasInicioDialogo: visao.tipo === 'ORGAO' && etapa === 'PRE_SELECAO' ? pendenciasInicioDialogo({ etapa, participantes, comissao }) : [],
      totais: { interessados: participantes.length, preSelecionados: pre },
      participantes: (visao.tipo === 'ORGAO' ? participantes : meu ? [meu] : []).map((p) => ({
        id: p.id,
        fornecedorId: visao.tipo === 'ORGAO' ? p.fornecedor_id : undefined,
        razaoSocial: visao.tipo === 'ORGAO' ? nomes.get(p.fornecedor_id) ?? null : undefined,
        manifestacao: p.manifestacao,
        temDocumento: !!p.documento_sha256,
        manifestadoEm: p.manifestado_em,
        situacao: p.situacao,
        criteriosAtendidos: p.criterios_atendidos,
        decisaoMotivo: p.decisao_motivo,
        decididoEm: p.decidido_em,
        // Pedido de reconsideração (art. 165, II): só o órgão dono e o próprio interessado leem
        prazoPedidoReconsideracao: p.situacao === 'NAO_SELECIONADO' && p.decidido_em ? prazoPedidoReconsideracao(new Date(p.decidido_em), cal) : null,
        reconsideracao: p.reconsideracao_status
          ? {
              status: p.reconsideracao_status,
              razoes: p.reconsideracao_razoes,
              temArquivo: !!p.reconsideracao_arquivo_sha256,
              pedidaEm: p.reconsideracao_pedida_em,
              prazoDecisao: p.reconsideracao_prazo_decisao,
              decisaoAtrasada: p.reconsideracao_status === 'PENDENTE' && !!p.reconsideracao_prazo_decisao && Date.now() > new Date(p.reconsideracao_prazo_decisao).getTime(),
              fundamentacao: p.reconsideracao_fundamentacao,
              decididaEm: p.reconsideracao_decidida_em,
            }
          : null,
        historico: p.historico ?? [],
      })),
      reunioes: reunioes.map((r) => ({
        id: r.id,
        participanteId: r.participante_id,
        rodada: r.rodada,
        agendadaPara: r.agendada_para,
        pauta: r.pauta,
        localOuLink: r.local_ou_link,
        status: r.status,
        realizadaEm: r.realizada_em,
        ataTexto: r.ata_texto,
        temAtaArquivo: !!r.ata_arquivo,
        gravacaoLink: r.gravacao_link,
        temGravacaoArquivo: !!r.gravacao_arquivo,
        motivoCancelamento: r.motivo_cancelamento,
      })),
      documentos: documentos.map((x) => ({
        id: x.id,
        participanteId: x.participante_id,
        reuniaoId: x.reuniao_id,
        titulo: x.titulo,
        descricao: x.descricao,
        temArquivo: !!x.arquivo,
        consentimentoDivulgacao: x.consentimento_divulgacao,
        enviadoEm: x.created_at,
      })),
    };
  }

  // ==========================================================================
  // EDITAL (fase interna) e COMISSÃO
  // ==========================================================================

  async salvarConfiguracao(licitacaoId: string, dto: Record<string, any>) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (!FASES_INTERNAS.includes(lic.fase)) throw new ConflictException('Edital publicado — altere pela retificação do edital (art. 55, §1º).');
    const repo = this.ds.getRepository(DialogoCompetitivo);
    const atual = await repo.findOne({ where: { licitacao_id: licitacaoId } });
    const dados: Record<string, any> = {};
    for (const c of ['hipoteses', 'justificativa_hipotese', 'necessidades', 'exigencias_definidas', 'fases_sucessivas']) if (dto?.[c] !== undefined) dados[c] = dto[c];
    if (dto?.criterios_preselecao !== undefined) {
      dados.criterios_preselecao = (Array.isArray(dto.criterios_preselecao) ? dto.criterios_preselecao : [])
        .filter((c: any) => String(c?.descricao ?? c ?? '').trim())
        .map((c: any, i: number) => ({ id: String(c?.id || `C${i + 1}`), descricao: String(c?.descricao ?? c).trim().slice(0, 1000) }));
    }
    const final = { ...(atual ?? {}), ...dados };
    const erros = validarConfiguracaoDialogo(final as any);
    if (erros.length) throw new BadRequestException({ message: erros.join(' | '), pendencias: erros });
    await repo.save(repo.create({ ...(atual ?? {}), ...dados, licitacao_id: licitacaoId }));
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /** Comissão de contratação (§1º XI) — até a conclusão do diálogo. */
  async definirComissao(licitacaoId: string, membros: Array<Record<string, any>>) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const d = await this.ds.getRepository(DialogoCompetitivo).findOne({ where: { licitacao_id: licitacaoId } });
    if (d && ['CONCLUIDO', 'COMPETITIVA'].includes(d.etapa)) throw new ConflictException('Diálogo concluído — a comissão que o conduziu não se altera.');
    if (!Array.isArray(membros) || !membros.length) throw new BadRequestException('Informe os membros da comissão.');
    const linhas: Partial<DialogoComissaoMembro>[] = [];
    for (const mb of membros) {
      const vinculo = String(mb?.vinculo ?? '');
      if (!['EFETIVO', 'EMPREGADO_PERMANENTE', 'ASSESSOR_CONTRATADO'].includes(vinculo)) throw new BadRequestException('Vínculo inválido: EFETIVO, EMPREGADO_PERMANENTE ou ASSESSOR_CONTRATADO (art. 32, §1º, XI).');
      let nome = String(mb?.nome ?? '').trim();
      let cargo = mb?.cargo ? String(mb.cargo) : null;
      if (mb?.usuario_id) {
        const [u] = await this.ds.query(`SELECT nome, cargo, orgao_id::text AS orgao_id FROM usuarios WHERE id::text = $1`, [mb.usuario_id]);
        if (!u || u.orgao_id !== String(lic.orgao_id)) throw new BadRequestException('Membro da comissão deve ser usuário do órgão licitante (ou assessor externo sem usuário).');
        nome = nome || u.nome;
        cargo = cargo || u.cargo;
      } else if (vinculo !== 'ASSESSOR_CONTRATADO') {
        throw new BadRequestException('Servidor/empregado da comissão deve ser usuário do órgão (art. 32, §1º, XI).');
      }
      if (!nome) throw new BadRequestException('Informe o nome do membro.');
      const assessor = vinculo === 'ASSESSOR_CONTRATADO';
      linhas.push({
        licitacao_id: licitacaoId,
        usuario_id: mb?.usuario_id ?? null,
        nome: nome.slice(0, 200),
        cargo,
        vinculo: vinculo as any,
        papel: assessor ? 'ASSESSOR' : mb?.papel === 'PRESIDENTE' ? 'PRESIDENTE' : 'MEMBRO',
        termo_confidencialidade_em: assessor && (mb?.termo_confidencialidade === true || mb?.termo_confidencialidade === 'true') ? new Date() : null,
      });
    }
    await this.ds.transaction(async (m) => {
      await m.delete(DialogoComissaoMembro, { licitacao_id: licitacaoId });
      await m.save(linhas.map((l) => m.create(DialogoComissaoMembro, l)));
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  // ==========================================================================
  // MANIFESTAÇÃO DE INTERESSE (§1º I) e PRÉ-SELEÇÃO (§1º II)
  // ==========================================================================

  async manifestarInteresse(licitacaoId: string, fornecedorId: string, dto: { manifestacao?: string }, arquivo: ArquivoEnviado | null) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const d = await this.dialogo(licitacaoId);
    if (lic.fase !== FaseLicitacao.ACOLHIMENTO_PROPOSTAS || d.etapa !== 'MANIFESTACAO' || (lic.data_fim_acolhimento && Date.now() >= new Date(lic.data_fim_acolhimento).getTime())) {
      throw new ConflictException('Fora do prazo de manifestação de interesse (art. 32, §1º, I).');
    }
    const texto = String(dto?.manifestacao ?? '').trim();
    if (texto.length < 20) throw new BadRequestException('Descreva a manifestação de interesse e como atende aos critérios de pré-seleção (mínimo 20 caracteres).');
    if (arquivo?.buffer?.length) {
      if (!MIMES_DOC.includes(String(arquivo.mimetype))) throw new BadRequestException('Documento: use PDF, JPG, PNG ou ZIP.');
      if (Number(arquivo.size) > 20 * 1024 * 1024) throw new BadRequestException('Documento acima de 20 MB.');
    }
    const repo = this.ds.getRepository(DialogoParticipante);
    const atual = await repo.findOne({ where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId } });
    const dados: Partial<DialogoParticipante> = {
      licitacao_id: licitacaoId,
      fornecedor_id: fornecedorId,
      manifestacao: texto.slice(0, 8000),
      manifestado_em: new Date(),
      situacao: 'INTERESSADO',
      ...(arquivo?.buffer?.length
        ? {
            documento: arquivo.buffer,
            documento_nome: String(arquivo.originalname || 'documento').slice(0, 250),
            documento_mime: String(arquivo.mimetype),
            documento_sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
          }
        : {}),
    };
    if (atual) await repo.update(atual.id, dados);
    else await repo.save(repo.create(dados));
    return this.painel(licitacaoId, { tipo: 'FORNECEDOR', fornecedorId });
  }

  async decidirPreSelecao(licitacaoId: string, participanteId: string, dto: { decisao?: string; criterios_atendidos?: string[]; motivo?: string }, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const d = await this.dialogo(licitacaoId);
    if (etapaEfetiva(d.etapa, lic.fase) !== 'PRE_SELECAO') throw new ConflictException('A pré-seleção ocorre depois do fim do prazo de manifestação e antes do início do diálogo.');
    const p = await this.ds.getRepository(DialogoParticipante).findOne({ where: { id: participanteId, licitacao_id: licitacaoId } });
    if (!p) throw new NotFoundException('Interessado não encontrado');
    const criterios = (d.criterios_preselecao ?? []).map((c) => c.id);
    const atendidos = (Array.isArray(dto?.criterios_atendidos) ? dto.criterios_atendidos : []).map(String).filter((c) => criterios.includes(c));
    const invalida = motivoDecisaoPreSelecaoInvalida({ decisao: String(dto?.decisao ?? ''), criteriosAtendidos: atendidos, criteriosDoEdital: criterios, motivo: dto?.motivo });
    if (invalida) throw new BadRequestException(invalida);
    await this.ds.getRepository(DialogoParticipante).update(p.id, {
      situacao: dto.decisao as any,
      criterios_atendidos: atendidos,
      decisao_motivo: dto?.motivo ? String(dto.motivo).trim().slice(0, 4000) : null,
      decidido_em: new Date(),
      decidido_por: `${ator.tipo}:${ator.id ?? ''}`,
      historico: [
        ...(p.historico ?? []),
        { em: new Date().toISOString(), ato: dto.decisao === 'PRE_SELECIONADO' ? 'PRE_SELECIONADO' : 'NAO_SELECIONADO', por: `${ator.tipo}:${ator.id ?? ''}`, detalhe: dto?.motivo ? String(dto.motivo).slice(0, 500) : null },
      ],
    });
    if (d.etapa === 'MANIFESTACAO') await this.ds.getRepository(DialogoCompetitivo).update(d.id, { etapa: 'PRE_SELECAO' });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  // ==========================================================================
  // PEDIDO DE RECONSIDERAÇÃO da não seleção (Lei 14.133/2021, art. 165, II)
  // ==========================================================================

  /** O interessado NÃO selecionado (token) pede reconsideração em 3 dias úteis da intimação. */
  async pedirReconsideracao(licitacaoId: string, fornecedorId: string, dto: { razoes?: string }, arquivo: ArquivoEnviado | null) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const d = await this.dialogo(licitacaoId);
    const p = await this.participanteDoFornecedor(licitacaoId, fornecedorId);
    if (!p) throw new NotFoundException('Manifestação de interesse não encontrada');
    const cal = calendarioDoOrgao(lic.orgao_id ?? null);
    const agora = new Date();
    const invalido = motivoPedidoReconsideracaoInvalido({
      situacao: p.situacao,
      etapa: etapaEfetiva(d.etapa, lic.fase),
      jaPediu: !!p.reconsideracao_status,
      intimacao: p.decidido_em,
      agora,
      razoes: dto?.razoes,
      cal,
    });
    if (invalido) {
      if (invalido.includes('razões')) throw new BadRequestException(invalido);
      throw new ConflictException(invalido);
    }
    if (arquivo?.buffer?.length) {
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(String(arquivo.mimetype))) throw new BadRequestException('Arquivo: use PDF, JPG ou PNG.');
      if (Number(arquivo.size) > 10 * 1024 * 1024) throw new BadRequestException('Arquivo acima de 10 MB.');
    }
    await this.ds.getRepository(DialogoParticipante).update(p.id, {
      reconsideracao_status: 'PENDENTE',
      reconsideracao_razoes: String(dto.razoes).trim().slice(0, 8000),
      reconsideracao_pedida_em: agora,
      reconsideracao_prazo_decisao: fimDoPrazoEmDiasUteis(agora, DIAS_UTEIS_DECISAO_RECONSIDERACAO, cal),
      ...(arquivo?.buffer?.length
        ? {
            reconsideracao_arquivo: arquivo.buffer,
            reconsideracao_arquivo_nome: String(arquivo.originalname || 'razoes').slice(0, 250),
            reconsideracao_arquivo_mime: String(arquivo.mimetype),
            reconsideracao_arquivo_sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
          }
        : {}),
      historico: [...(p.historico ?? []), { em: agora.toISOString(), ato: 'PEDIDO_RECONSIDERACAO', por: `FORNECEDOR:${fornecedorId}`, detalhe: null }],
    });
    return this.painel(licitacaoId, { tipo: 'FORNECEDOR', fornecedorId });
  }

  /** Comissão/agente decide o pedido com fundamentação; provido → o interessado é admitido ao diálogo. */
  async decidirReconsideracao(licitacaoId: string, participanteId: string, dto: { provido?: any; fundamentacao?: string }, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const d = await this.dialogo(licitacaoId);
    const fundamentacao = String(dto?.fundamentacao ?? '').trim();
    if (fundamentacao.length < 20) throw new BadRequestException('Fundamente a decisão do pedido de reconsideração (mínimo 20 caracteres).');
    const provido = dto?.provido === true || dto?.provido === 'true';
    await this.ds.transaction(async (m) => {
      const p = await m.getRepository(DialogoParticipante).findOne({ where: { id: participanteId, licitacao_id: licitacaoId }, lock: { mode: 'pessimistic_write' } });
      if (!p) throw new NotFoundException('Interessado não encontrado');
      if (p.reconsideracao_status !== 'PENDENTE') throw new ConflictException('Não há pedido de reconsideração pendente deste interessado.');
      if (!['PRE_SELECAO', 'DIALOGO'].includes(etapaEfetiva(d.etapa, lic.fase))) throw new ConflictException('A fase de diálogo já foi concluída.');
      const agora = new Date();
      const por = `${ator.tipo}:${ator.id ?? ''}`;
      await m.update(DialogoParticipante, p.id, {
        reconsideracao_status: provido ? 'PROVIDA' : 'IMPROVIDA',
        reconsideracao_fundamentacao: fundamentacao.slice(0, 8000),
        reconsideracao_decidida_em: agora,
        reconsideracao_decidida_por: por,
        ...(provido
          ? {
              situacao: 'PRE_SELECIONADO' as const,
              criterios_atendidos: (d.criterios_preselecao ?? []).map((c) => c.id),
              decisao_motivo: `Admitido em reconsideração (art. 165, II): ${fundamentacao.slice(0, 1000)}`,
            }
          : {}),
        historico: [...(p.historico ?? []), { em: agora.toISOString(), ato: provido ? 'RECONSIDERACAO_PROVIDA' : 'RECONSIDERACAO_IMPROVIDA', por, detalhe: fundamentacao.slice(0, 500) }],
      });
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /** Começa a fase de diálogo (pré-seleção concluída, comissão válida). */
  async iniciarDialogo(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const d = await this.dialogo(licitacaoId);
    const etapa = etapaEfetiva(d.etapa, lic.fase);
    const participantes = await this.ds.getRepository(DialogoParticipante).find({ where: { licitacao_id: licitacaoId } });
    const comissao = await this.ds.getRepository(DialogoComissaoMembro).find({ where: { licitacao_id: licitacaoId } });
    const pend = pendenciasInicioDialogo({ etapa, participantes, comissao });
    if (pend.length) throw new BadRequestException({ message: pend.join(' | '), pendencias: pend });
    await this.ds.getRepository(DialogoCompetitivo).update(d.id, { etapa: 'DIALOGO', dialogo_iniciado_em: new Date() });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  // ==========================================================================
  // FASE DE DIÁLOGO: reuniões (§1º VI) e soluções (§1º IV)
  // ==========================================================================

  private async exigirDialogoEmCurso(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const d = await this.dialogo(licitacaoId);
    if (d.etapa !== 'DIALOGO') throw new ConflictException('Ato da fase de diálogo — a fase não está em curso.');
    return { lic, d };
  }

  async agendarReuniao(licitacaoId: string, dto: { participanteId?: string; agendada_para?: string; pauta?: string; local_ou_link?: string; rodada?: number }) {
    await this.exigirDialogoEmCurso(licitacaoId);
    const p = await this.ds.getRepository(DialogoParticipante).findOne({ where: { id: String(dto?.participanteId ?? ''), licitacao_id: licitacaoId } });
    if (!p || p.situacao !== 'PRE_SELECIONADO') throw new BadRequestException('As reuniões são com licitante pré-selecionado — uma reunião por licitante (sigilo — art. 32, §1º, IV).');
    const quando = dto?.agendada_para ? new Date(dto.agendada_para) : null;
    if (!quando || Number.isNaN(quando.getTime())) throw new BadRequestException('Informe a data e a hora da reunião.');
    const pauta = String(dto?.pauta ?? '').trim();
    if (pauta.length < 5) throw new BadRequestException('Informe a pauta da reunião.');
    const r = await this.ds.getRepository(DialogoReuniao).save(
      this.ds.getRepository(DialogoReuniao).create({
        licitacao_id: licitacaoId,
        participante_id: p.id,
        rodada: Number(dto?.rodada) > 0 ? Number(dto.rodada) : 1,
        agendada_para: quando,
        pauta: pauta.slice(0, 4000),
        local_ou_link: dto?.local_ou_link ? String(dto.local_ou_link).slice(0, 400) : null,
        status: 'AGENDADA',
      }),
    );
    return { id: r.id, painel: await this.painel(licitacaoId, { tipo: 'ORGAO' }) };
  }

  /** Registro da reunião: ata (texto/arquivo) e gravação em áudio e vídeo (arquivo/link) — ambos obrigatórios (§1º VI). */
  async registrarReuniao(
    licitacaoId: string,
    reuniaoId: string,
    dto: { ata_texto?: string; gravacao_link?: string },
    arquivos: { ata?: ArquivoEnviado | null; gravacao?: ArquivoEnviado | null },
    ator: AtorTransicao,
  ) {
    await this.exigirDialogoEmCurso(licitacaoId);
    const repo = this.ds.getRepository(DialogoReuniao);
    const r = await repo.findOne({ where: { id: reuniaoId, licitacao_id: licitacaoId } });
    if (!r) throw new NotFoundException('Reunião não encontrada');
    if (r.status !== 'AGENDADA') throw new ConflictException('Reunião já registrada ou cancelada.');
    const ataTexto = String(dto?.ata_texto ?? '').trim();
    const link = String(dto?.gravacao_link ?? '').trim();
    if (!ataTexto && !arquivos.ata?.buffer?.length) throw new BadRequestException('A reunião é registrada em ata (art. 32, §1º, VI) — informe o texto ou anexe a ata.');
    if (!link && !arquivos.gravacao?.buffer?.length) throw new BadRequestException('A reunião é gravada em áudio e vídeo (art. 32, §1º, VI) — anexe a gravação ou informe o link do repositório oficial.');
    if (link && !/^https:\/\/\S+$/i.test(link)) throw new BadRequestException('Link da gravação inválido (use https://).');
    if (arquivos.ata?.buffer?.length && !MIMES_DOC.includes(String(arquivos.ata.mimetype))) throw new BadRequestException('Ata: use PDF, JPG ou PNG.');
    if (arquivos.gravacao?.buffer?.length && !MIMES_GRAVACAO.includes(String(arquivos.gravacao.mimetype))) throw new BadRequestException('Gravação: use MP4, WEBM, MOV, MKV ou áudio MP3/M4A.');
    const ata = arquivos.ata?.buffer?.length ? this.gravarArquivo(licitacaoId, 'ata', arquivos.ata) : null;
    const grav = arquivos.gravacao?.buffer?.length ? this.gravarArquivo(licitacaoId, 'gravacao', arquivos.gravacao) : null;
    await repo.update(r.id, {
      status: 'REALIZADA',
      realizada_em: new Date(),
      ata_texto: ataTexto || null,
      ata_arquivo: ata?.caminho ?? null,
      gravacao_arquivo: grav?.caminho ?? null,
      gravacao_link: link || null,
      gravacao_sha256: grav?.sha256 ?? null,
      registrada_por: `${ator.tipo}:${ator.id ?? ''}`,
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  async cancelarReuniao(licitacaoId: string, reuniaoId: string, motivo: string) {
    await this.exigirDialogoEmCurso(licitacaoId);
    const repo = this.ds.getRepository(DialogoReuniao);
    const r = await repo.findOne({ where: { id: reuniaoId, licitacao_id: licitacaoId } });
    if (!r) throw new NotFoundException('Reunião não encontrada');
    if (r.status !== 'AGENDADA') throw new ConflictException('Só se cancela reunião agendada.');
    if (String(motivo ?? '').trim().length < 5) throw new BadRequestException('Informe o motivo do cancelamento.');
    await repo.update(r.id, { status: 'CANCELADA', motivo_cancelamento: String(motivo).trim().slice(0, 2000) });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /** Solução/informação do licitante pré-selecionado — sigilosa entre licitantes (§1º IV). */
  async enviarDocumento(
    licitacaoId: string,
    fornecedorId: string,
    dto: { titulo?: string; descricao?: string; reuniaoId?: string; consentimento_divulgacao?: any },
    arquivo: ArquivoEnviado | null,
  ) {
    await this.exigirDialogoEmCurso(licitacaoId);
    const p = await this.participanteDoFornecedor(licitacaoId, fornecedorId);
    if (!p || p.situacao !== 'PRE_SELECIONADO') throw new NotFoundException('Somente licitantes pré-selecionados participam do diálogo.');
    const titulo = String(dto?.titulo ?? '').trim();
    if (titulo.length < 3) throw new BadRequestException('Informe o título do documento.');
    if (dto?.reuniaoId) {
      const r = await this.ds.getRepository(DialogoReuniao).findOne({ where: { id: String(dto.reuniaoId), licitacao_id: licitacaoId } });
      if (!r || r.participante_id !== p.id) throw new NotFoundException('Reunião não encontrada');
    }
    if (arquivo?.buffer?.length && !MIMES_DOC.includes(String(arquivo.mimetype))) throw new BadRequestException('Documento: use PDF, JPG, PNG ou ZIP.');
    const a = arquivo?.buffer?.length ? this.gravarArquivo(licitacaoId, 'solucao', arquivo) : null;
    await this.ds.getRepository(DialogoDocumento).save(
      this.ds.getRepository(DialogoDocumento).create({
        licitacao_id: licitacaoId,
        participante_id: p.id,
        reuniao_id: dto?.reuniaoId ? String(dto.reuniaoId) : null,
        titulo: titulo.slice(0, 200),
        descricao: dto?.descricao ? String(dto.descricao).slice(0, 8000) : null,
        arquivo: a?.caminho ?? null,
        arquivo_nome: a?.nome ?? null,
        arquivo_sha256: a?.sha256 ?? null,
        consentimento_divulgacao: dto?.consentimento_divulgacao === true || dto?.consentimento_divulgacao === 'true',
      }),
    );
    return this.painel(licitacaoId, { tipo: 'FORNECEDOR', fornecedorId });
  }

  /**
   * Arquivos do diálogo (ata, gravação, documento da manifestação e soluções):
   * órgão dono; o próprio licitante; NUNCA outro licitante (§1º IV).
   */
  async arquivo(licitacaoId: string, tipo: string, id: string, visao: VisaoDialogo): Promise<{ caminho?: string; conteudo?: Buffer; nome: string; mime?: string }> {
    await this.licitacao(licitacaoId);
    if (visao.tipo === 'PUBLICO') throw new NotFoundException('Arquivo não encontrado');
    const meuParticipante = visao.tipo === 'FORNECEDOR' ? await this.participanteDoFornecedor(licitacaoId, visao.fornecedorId) : null;
    const pode = (participanteId: string) => visao.tipo === 'ORGAO' || (!!meuParticipante && meuParticipante.id === participanteId);
    if (tipo === 'ata' || tipo === 'gravacao') {
      const r = await this.ds.getRepository(DialogoReuniao).findOne({ where: { id, licitacao_id: licitacaoId } });
      if (!r || !pode(r.participante_id)) throw new NotFoundException('Arquivo não encontrado');
      const caminho = DialogoService.caminhoFisico(tipo === 'ata' ? r.ata_arquivo : r.gravacao_arquivo);
      if (!caminho) throw new NotFoundException('Arquivo não encontrado');
      return { caminho, nome: path.basename(caminho) };
    }
    if (tipo === 'documento') {
      const x = await this.ds.getRepository(DialogoDocumento).findOne({ where: { id, licitacao_id: licitacaoId } });
      if (!x || !pode(x.participante_id)) throw new NotFoundException('Arquivo não encontrado');
      const caminho = DialogoService.caminhoFisico(x.arquivo);
      if (!caminho) throw new NotFoundException('Arquivo não encontrado');
      return { caminho, nome: x.arquivo_nome ?? path.basename(caminho) };
    }
    if (tipo === 'reconsideracao') {
      const p = await this.ds
        .getRepository(DialogoParticipante)
        .createQueryBuilder('p')
        .addSelect('p.reconsideracao_arquivo')
        .where('p.id = :id AND p.licitacao_id = :l', { id, l: licitacaoId })
        .getOne();
      if (!p?.reconsideracao_arquivo || !pode(p.id)) throw new NotFoundException('Arquivo não encontrado');
      return { conteudo: p.reconsideracao_arquivo, nome: p.reconsideracao_arquivo_nome ?? 'razoes', mime: p.reconsideracao_arquivo_mime ?? 'application/pdf' };
    }
    if (tipo === 'manifestacao') {
      const p = await this.ds
        .getRepository(DialogoParticipante)
        .createQueryBuilder('p')
        .addSelect('p.documento')
        .where('p.id = :id AND p.licitacao_id = :l', { id, l: licitacaoId })
        .getOne();
      if (!p?.documento || !pode(p.id)) throw new NotFoundException('Arquivo não encontrado');
      return { conteudo: p.documento, nome: p.documento_nome ?? 'documento', mime: p.documento_mime ?? 'application/octet-stream' };
    }
    throw new NotFoundException('Arquivo não encontrado');
  }

  // ==========================================================================
  // CONCLUSÃO (§1º V e VIII) e FASE COMPETITIVA (§1º VIII)
  // ==========================================================================

  async concluirDialogo(licitacaoId: string, dto: { motivacao?: string; solucao_identificada?: string }, ator: AtorTransicao) {
    await this.licitacao(licitacaoId);
    const motivacao = String(dto?.motivacao ?? '').trim();
    if (motivacao.length < TAMANHO_MINIMO_MOTIVACAO) {
      throw new BadRequestException(`A conclusão do diálogo é decisão fundamentada (art. 32, §1º, V) — motivação com ao menos ${TAMANHO_MINIMO_MOTIVACAO} caracteres.`);
    }
    await this.transicoes.executar(licitacaoId, AtoLicitacao.CONCLUIR_DIALOGO, {
      ator,
      motivo: motivacao,
      dados: { solucao_identificada: String(dto?.solucao_identificada ?? '').trim() },
      registro: { origem: 'dialogo-competitivo' },
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /**
   * Edital da fase competitiva: arquivo (PDF) + especificação da solução +
   * critérios objetivos + critério/modo de julgamento + cronograma com ≥ 60
   * dias úteis (§1º VIII; calendário do órgão). Ato ABRIR_FASE_COMPETITIVA.
   */
  async abrirFaseCompetitiva(licitacaoId: string, dto: Record<string, any>, edital: ArquivoEnviado | null, ator: AtorTransicao) {
    await this.licitacao(licitacaoId);
    if (edital?.buffer?.length && edital.mimetype !== 'application/pdf') throw new BadRequestException('Edital da fase competitiva: arquivo PDF.');
    const sha = edital?.buffer?.length ? createHash('sha256').update(edital.buffer).digest('hex') : null;
    const dados = {
      especificacao_solucao: dto?.especificacao_solucao,
      criterios_selecao: dto?.criterios_selecao,
      criterio_julgamento: dto?.criterio_julgamento,
      modo_disputa: dto?.modo_disputa || 'ABERTO',
      data_inicio_acolhimento: dto?.data_inicio_acolhimento || new Date().toISOString(),
      data_fim_acolhimento: dto?.data_fim_acolhimento,
      data_abertura_sessao: dto?.data_abertura_sessao,
      data_limite_impugnacao: dto?.data_limite_impugnacao || null,
      edital_sha256: sha,
    };
    await this.transicoes.verificar(licitacaoId, AtoLicitacao.ABRIR_FASE_COMPETITIVA, { ator, dados });
    const arq = this.gravarArquivo(licitacaoId, 'edital-fase-competitiva', { ...edital!, originalname: 'edital-fase-competitiva.pdf' });
    try {
      await this.transicoes.executar(licitacaoId, AtoLicitacao.ABRIR_FASE_COMPETITIVA, {
        ator,
        dados,
        registro: { origem: 'dialogo-competitivo', edital: { caminho: arq.caminho, sha256: arq.sha256 } },
        aplicar: async (_l, m) => {
          await m.query(`UPDATE dialogo_competitivo SET edital_competitivo_caminho = $2, edital_competitivo_sha256 = $3, updated_at = now() WHERE licitacao_id = $1`, [
            licitacaoId,
            arq.caminho,
            arq.sha256,
          ]);
        },
      });
    } catch (e) {
      try {
        const p = DialogoService.caminhoFisico(arq.caminho);
        if (p) fs.unlinkSync(p);
      } catch {
        /* órfão */
      }
      throw e;
    }
    this.logger.log(`[${licitacaoId}] fase competitiva do diálogo publicada`);
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /** Edital da fase competitiva: público depois de publicado; órgão dono sempre. */
  async editalCompetitivo(licitacaoId: string, visao: VisaoDialogo) {
    const d = await this.dialogo(licitacaoId);
    if (visao.tipo !== 'ORGAO' && !d.fase_competitiva_publicada_em) throw new NotFoundException('Edital da fase competitiva ainda não publicado');
    const caminho = DialogoService.caminhoFisico(d.edital_competitivo_caminho);
    if (!caminho) throw new NotFoundException('Edital da fase competitiva não encontrado');
    return { caminho, nome: 'edital-fase-competitiva.pdf' };
  }
}
