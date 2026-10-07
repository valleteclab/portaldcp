import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { ModeloDocumento } from '../fase-interna/entities/modelo-documento.entity';
import { TipoDocumentoFaseInterna } from '../fase-interna/entities/documento-fase-interna.entity';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { escolherDestinatarios, PerfilTramitacao } from '../fase-interna/tramitacao-regras';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { Processo, TipoProcesso } from './entities/processo.entity';
import { anoDeBrasilia, chaveSequenciaOficio, numerarTexto, numeroDoOficio, tituloDoOficio, TIPO_PECA_OFICIO } from './oficio';
import { ProcessoMovimentacao, ProcessoPeca } from './entities/processo-tramitacao.entity';
import { calcularEtapas, EtapaCalculada, etapaAtual, etapasPadraoDe, sugerirSetor } from './tipos/etapas-padrao';
import {
  montarLinhaDoTempo,
  podeAtuar,
  situacaoDaPosse,
  temTramitacaoPropria,
  textoDoDestino,
  validarDespacho,
  validarDestino,
  validarPeca,
  folhasDaPeca,
  TIPOS_COM_TRAMITACAO_PROPRIA,
} from './processo-tramitacao-regras';
import { ProcessoService } from './processo.service';
import { textoDeAutuacao } from './processo-regras';
import { IaService } from '../ia/ia.service';
import { caminhoLogico, diretorioDeGravacao, resolverArquivo } from '../common/arquivos/arquivos';
import { contarPaginasPdf } from '../fase-interna/folhas-autos';
import {
  aplicarVariaveisDaPeca,
  blocosDaPeca,
  ContextoDaPeca,
  extrairJsonDaResposta,
  htmlDaPecaSeguro,
  htmlDoModelo,
  modeloDaPeca,
  montarPromptDaPeca,
  temLacuna,
  textoDaPeca,
} from './peca-documento';
import { gerarPdfPeca } from './peca-pdf';
import { WorkflowService } from '../workflow/workflow.service';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface Perfil extends PerfilTramitacao {
  orgao_id: string;
}

interface Destino {
  para_setor_id: string | null;
  para_setor_nome: string | null;
  para_usuario_id: string | null;
  para_usuario_nome: string | null;
}

/**
 * TRAMITAÇÃO GENÉRICA DO PROCESSO ELETRÔNICO — para os tipos que não têm
 * licitação (ADITIVO, RENOVACAO, AVULSO): posse ("está com"), enviar,
 * receber, devolver, juntar peça aos autos, etapas padrão e linha do tempo.
 *
 * Isolamento: o órgão é sempre o do token (processo de outro órgão → 404);
 * quem age vem do JWT + cadastro (nunca do corpo); setor/pessoa de destino
 * precisam ser do mesmo órgão. A CONTRATAÇÃO continua nas rotas da fase interna.
 */
@Injectable()
export class ProcessoTramitacaoService {
  private readonly logger = new Logger(ProcessoTramitacaoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly processos: ProcessoService,
    private readonly notificacoes: NotificacoesService,
    private readonly ia: IaService,
    @InjectRepository(ModeloDocumento) private readonly modelosRepo: Repository<ModeloDocumento>,
    private readonly workflow: WorkflowService,
  ) {}

  // ==========================================================================
  // Apoio
  // ==========================================================================

  /** Processo do órgão do ator, de um tipo com tramitação própria; senão 404/400. */
  async carregar(ator: Ator, id: string): Promise<Processo> {
    const p = await this.processos.obter(ator, id);
    if (!temTramitacaoPropria(p.tipo)) {
      throw new BadRequestException('A tramitação deste processo segue pelas rotas da licitação.');
    }
    return p;
  }

  private exigirAberto(p: Processo) {
    if (p.situacao === 'ENCERRADO') throw new ConflictException('O processo está encerrado.');
  }

  async perfil(ator: Ator, orgaoId: string): Promise<Perfil> {
    if (ator.admin) {
      return { usuario_id: null, nome: 'Administrador da plataforma', cargo: null, setor_id: null, admin_orgao: true, orgao_id: orgaoId };
    }
    if (ator.orgaoId !== orgaoId) throw new NotFoundException('Processo não encontrado');
    if (ator.tipo === 'ORGAO') {
      const [o] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [orgaoId]);
      return { usuario_id: null, nome: o?.nome || 'Órgão', cargo: null, setor_id: null, admin_orgao: true, orgao_id: orgaoId };
    }
    const [u] =
      ator.usuarioId && ehUuid(ator.usuarioId)
        ? await this.ds.query(
            `SELECT id::text AS id, nome, cargo, setor_id::text AS setor_id, role::text AS role, orgao_id::text AS orgao_id, ativo
               FROM usuarios WHERE id::text = $1`,
            [ator.usuarioId],
          )
        : [];
    if (!u || u.orgao_id !== orgaoId || u.ativo === false) throw new ForbiddenException('Usuário sem acesso a este processo');
    return { usuario_id: u.id, nome: u.nome || 'Usuário', cargo: u.cargo || null, setor_id: u.setor_id || null, admin_orgao: u.role === 'ADMIN', orgao_id: orgaoId };
  }

  private async chefeDoSetor(setorId: string | null | undefined): Promise<string | null> {
    if (!setorId || !ehUuid(setorId)) return null;
    const [s] = await this.ds.query(`SELECT chefe_usuario_id::text AS chefe FROM setores WHERE id::text = $1`, [setorId]);
    return s?.chefe ?? null;
  }

  private async nomeDoSetor(setorId: string | null | undefined): Promise<string | null> {
    if (!setorId || !ehUuid(setorId)) return null;
    const [s] = await this.ds.query(`SELECT nome FROM setores WHERE id::text = $1`, [setorId]);
    return s?.nome ?? null;
  }

  /** Posse atual (a última movimentação), lida na própria transação quando houver. */
  private async atual(p: { id: string }, m?: EntityManager): Promise<ProcessoMovimentacao | null> {
    const [r] = await (m ?? this.ds.manager).query(
      `SELECT * FROM processo_movimentacoes WHERE processo_id = $1::uuid ORDER BY sequencia DESC LIMIT 1`,
      [p.id],
    );
    return r ?? null;
  }

  /** Destino do envio: setor e/ou pessoa DO MESMO ÓRGÃO (pessoa ativa); a pessoa traz o seu setor. */
  private async resolverDestino(orgaoId: string, d: { para_setor_id?: unknown; para_usuario_id?: unknown }): Promise<Destino> {
    let setorId = String(d.para_setor_id ?? '').trim() || null;
    const usuarioId = String(d.para_usuario_id ?? '').trim() || null;
    let usuarioNome: string | null = null;
    if (usuarioId) {
      if (!ehUuid(usuarioId)) throw new BadRequestException('Pessoa de destino inválida.');
      const [u] = await this.ds.query(`SELECT nome, setor_id::text AS setor_id, orgao_id::text AS orgao_id, ativo FROM usuarios WHERE id::text = $1`, [usuarioId]);
      if (!u || u.orgao_id !== orgaoId || u.ativo === false) throw new BadRequestException('A pessoa de destino não pertence ao órgão.');
      usuarioNome = u.nome;
      if (!setorId) setorId = u.setor_id ?? null;
    }
    let setorNome: string | null = null;
    if (setorId) {
      if (!(await this.processos.setorEhDoOrgao(orgaoId, setorId))) throw new BadRequestException('O setor de destino não pertence ao órgão.');
      setorNome = await this.nomeDoSetor(setorId);
    }
    return { para_setor_id: setorId, para_setor_nome: setorNome, para_usuario_id: usuarioId, para_usuario_nome: usuarioNome };
  }

  /** Trava a linha do processo na transação (serializa envios, recebimentos e juntadas). */
  private async travar(m: EntityManager, processoId: string) {
    await m.query(`SELECT id FROM processos WHERE id = $1::uuid FOR UPDATE`, [processoId]);
  }

  // ==========================================================================
  // Posse inicial
  // ==========================================================================

  /**
   * Quem abriu fica com o processo (já recebido): usuário → ele e a sua
   * lotação (ou o setor de origem informado); login do órgão → o setor de
   * origem, se houver. Idempotente.
   */
  async iniciarPosse(p: Processo, ator: Ator): Promise<void> {
    if (!temTramitacaoPropria(p.tipo)) return;
    const perfil = await this.perfil(ator, p.orgao_id);
    await this.ds.transaction(async (m) => {
      await this.travar(m, p.id);
      if (await this.atual(p, m)) return;
      const setorId = p.setor_origem_id ?? perfil.setor_id ?? null;
      const setorNome = await this.nomeDoSetor(setorId);
      const repo = m.getRepository(ProcessoMovimentacao);
      await repo.save(
        repo.create({
          processo_id: p.id,
          orgao_id: p.orgao_id,
          sequencia: 1,
          tipo: 'ABERTURA',
          de_setor_id: null,
          de_setor_nome: null,
          de_usuario_id: null,
          de_usuario_nome: perfil.nome,
          para_setor_id: setorId,
          para_setor_nome: setorNome,
          para_usuario_id: perfil.usuario_id,
          para_usuario_nome: perfil.usuario_id ? perfil.nome : null,
          despacho: 'Processo autuado.',
          recebida_em: new Date(),
          recebida_por_id: perfil.usuario_id,
          recebida_por_nome: perfil.nome,
        }),
      );
    });
  }

  // ==========================================================================
  // Ações
  // ==========================================================================

  async enviar(ator: Ator, id: string, body: any) {
    const p = await this.carregar(ator, id);
    this.exigirAberto(p);
    const erro = validarDestino(body ?? {});
    if (erro) throw new BadRequestException(erro);
    const perfil = await this.perfil(ator, p.orgao_id);
    const destino = await this.resolverDestino(p.orgao_id, body);
    const despacho = String(body.despacho).trim();
    const mov = await this.ds.transaction(async (m) => {
      await this.travar(m, p.id);
      const atual = await this.atual(p, m);
      if (!podeAtuar(perfil, atual, await this.chefeDoSetor(atual?.para_setor_id))) {
        throw new ForbiddenException(`Só quem está com o processo (${atual ? textoDoDestino(atual) : 'ninguém'}) ou o administrador do órgão pode enviá-lo adiante.`);
      }
      if (atual && !atual.recebida_em && !perfil.admin_orgao) throw new ConflictException('Receba o processo antes de enviá-lo adiante.');
      const repo = m.getRepository(ProcessoMovimentacao);
      return repo.save(
        repo.create({
          processo_id: p.id,
          orgao_id: p.orgao_id,
          sequencia: (atual?.sequencia ?? 0) + 1,
          tipo: 'ENVIO',
          de_setor_id: perfil.setor_id ?? atual?.para_setor_id ?? null,
          de_setor_nome: (await this.nomeDoSetor(perfil.setor_id ?? atual?.para_setor_id)) ?? null,
          de_usuario_id: perfil.usuario_id,
          de_usuario_nome: perfil.nome,
          ...destino,
          despacho,
          recebida_em: null,
          recebida_por_id: null,
          recebida_por_nome: null,
        }),
      );
    });
    await this.avisarChegada(p, mov, perfil.usuario_id);
    return this.tramitacao(p, ator);
  }

  async receber(ator: Ator, id: string) {
    const p = await this.carregar(ator, id);
    this.exigirAberto(p);
    const perfil = await this.perfil(ator, p.orgao_id);
    await this.ds.transaction(async (m) => {
      await this.travar(m, p.id);
      const atual = await this.atual(p, m);
      if (!atual) throw new ConflictException('O processo ainda não foi tramitado.');
      if (atual.recebida_em) throw new ConflictException('O processo já foi recebido.');
      if (!podeAtuar(perfil, atual, await this.chefeDoSetor(atual.para_setor_id))) {
        throw new ForbiddenException(`Só quem recebe o processo (${textoDoDestino(atual)}) ou o administrador do órgão pode recebê-lo.`);
      }
      await m.query(
        `UPDATE processo_movimentacoes SET recebida_em = now(), recebida_por_id = $2::uuid, recebida_por_nome = $3::varchar WHERE id = $1::uuid`,
        [atual.id, perfil.usuario_id, perfil.nome],
      );
    });
    return this.tramitacao(p, ator);
  }

  /** Devolve a quem enviou (o remetente da movimentação atual). */
  async devolver(ator: Ator, id: string, body: any) {
    const p = await this.carregar(ator, id);
    this.exigirAberto(p);
    const erro = validarDespacho(body?.despacho);
    if (erro) throw new BadRequestException(erro);
    const perfil = await this.perfil(ator, p.orgao_id);
    const mov = await this.ds.transaction(async (m) => {
      await this.travar(m, p.id);
      const atual = await this.atual(p, m);
      if (!atual || atual.tipo === 'ABERTURA' || (!atual.de_setor_id && !atual.de_usuario_id)) {
        throw new ConflictException('Não há para quem devolver: o processo ainda não foi enviado por ninguém.');
      }
      if (!podeAtuar(perfil, atual, await this.chefeDoSetor(atual.para_setor_id))) {
        throw new ForbiddenException(`Só quem está com o processo (${textoDoDestino(atual)}) ou o administrador do órgão pode devolvê-lo.`);
      }
      const repo = m.getRepository(ProcessoMovimentacao);
      return repo.save(
        repo.create({
          processo_id: p.id,
          orgao_id: p.orgao_id,
          sequencia: atual.sequencia + 1,
          tipo: 'DEVOLUCAO',
          de_setor_id: atual.para_setor_id,
          de_setor_nome: atual.para_setor_nome,
          de_usuario_id: perfil.usuario_id,
          de_usuario_nome: perfil.nome,
          para_setor_id: atual.de_setor_id,
          para_setor_nome: atual.de_setor_nome,
          para_usuario_id: atual.de_usuario_id,
          para_usuario_nome: atual.de_usuario_nome,
          despacho: String(body.despacho).trim(),
          recebida_em: null,
          recebida_por_id: null,
          recebida_por_nome: null,
        }),
      );
    });
    await this.avisarChegada(p, mov, perfil.usuario_id);
    return this.tramitacao(p, ator);
  }

  /**
   * Junta uma peça aos autos (texto feito no sistema e/ou arquivo anexado),
   * com folhas na ordem de juntada. Só quem está com o processo. Com `etapa`,
   * a peça conclui a etapa ATUAL do processo.
   */
  /** `interno.documentoDoSistema`: PDF gerado pelo próprio sistema (ex.: DFD consolidado) — não conta como "feito fora". Nunca vem do corpo da requisição. */
  async juntar(ator: Ator, id: string, body: any, interno?: { documentoDoSistema?: boolean }) {
    const p = await this.carregar(ator, id);
    this.exigirAberto(p);
    // Peça feita no editor: HTML limpo, sem lacuna aberta; o texto corrido vale para a validação e a busca
    const html = body?.texto_html ? htmlDaPecaSeguro(body.texto_html) : '';
    if (html && temLacuna(html)) throw new BadRequestException('A peça ainda tem lacunas em destaque. Preencha-as antes de juntar.');
    const v = validarPeca(html ? { ...body, texto: textoDaPeca(html), arquivo_url: undefined, arquivo_nome: undefined } : body ?? {});
    if ('erro' in v) throw new BadRequestException(v.erro);
    const perfil = await this.perfil(ator, p.orgao_id);
    const chaveEtapa = String(body?.etapa ?? '').trim() || null;
    // Documento de um nó do fluxo de processo (convenção `no:<acao_id>`, ver workflow/nos):
    // a conclusão da etapa é controlada pelo motor de workflow (concluir/devolver/indeferir),
    // não pelas etapas padrão do ADITIVO/RENOVACAO — por isso pula a validação abaixo.
    const ehEtapaDeNoDeFluxo = !!chaveEtapa && chaveEtapa.startsWith('no:');
    // ...mas só para o responsável pela etapa aberta no fluxo deste processo (403/400 caso contrário)
    if (ehEtapaDeNoDeFluxo) {
      const regra = await this.workflow.exigirResponsavelDaEtapaDoProcesso(p.orgao_id, p.id, chaveEtapa!.slice(3), ator);
      if (!html && !interno?.documentoDoSistema && !regra.aceitaDocumentoExterno) throw new BadRequestException('Esta etapa exige o documento feito no sistema: escreva no editor (pode usar a IA).');
    }
    const iaModelo = html ? String(body?.ia_modelo ?? '').trim().slice(0, 100) || null : null;
    const peca = await this.ds.transaction(async (m) => {
      await this.travar(m, p.id);
      const atual = await this.atual(p, m);
      if (!ehEtapaDeNoDeFluxo) {
        if (!podeAtuar(perfil, atual, await this.chefeDoSetor(atual?.para_setor_id))) {
          throw new ForbiddenException('Só quem está com o processo (ou o administrador do órgão) pode juntar peças aos autos.');
        }
        if (atual && !atual.recebida_em && !perfil.admin_orgao) throw new ConflictException('Receba o processo antes de juntar peças.');
      }
      let tipoPeca: string | null = String(body?.tipo_peca ?? '').trim().slice(0, 40) || null;
      if (chaveEtapa && !ehEtapaDeNoDeFluxo) {
        const etapas = await this.etapasDoProcesso(p, m);
        const alvo = etapas.find((e) => e.chave === chaveEtapa);
        if (!alvo || alvo.resultado) throw new BadRequestException('Etapa inválida para juntar peça.');
        if (alvo.estado !== 'ATUAL') throw new BadRequestException('Esta não é a etapa atual do processo.');
        tipoPeca = tipoPeca ?? alvo.tipo_peca;
      }
      // Ofício: o número sai agora, na sequência do setor de quem assina (por ano, fuso de Brasília)
      const ehOficio = p.tipo === TipoProcesso.OFICIO && tipoPeca === TIPO_PECA_OFICIO;
      let titulo = v.dados.titulo;
      let texto = v.dados.texto;
      let htmlFinal = html;
      let numeroDocumento: string | null = null;
      if (ehOficio) {
        const ano = anoDeBrasilia(new Date());
        await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [chaveSequenciaOficio(p.orgao_id, perfil.setor_id ?? null, ano)]);
        const [seq] = await m.query(
          `SELECT COUNT(*)::int AS n FROM processo_pecas
            WHERE orgao_id = $1::uuid AND tipo_peca = $2 AND setor_autor_id IS NOT DISTINCT FROM $3::uuid
              AND EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $4`,
          [p.orgao_id, TIPO_PECA_OFICIO, perfil.setor_id ?? null, ano],
        );
        numeroDocumento = numeroDoOficio(Number(seq?.n ?? 0) + 1, ano);
        await m.query(`UPDATE processos SET rascunho_peca = NULL WHERE id = $1::uuid`, [p.id]);
        titulo = tituloDoOficio(numeroDocumento);
        if (htmlFinal) htmlFinal = numerarTexto(htmlFinal, numeroDocumento);
        if (texto) texto = numerarTexto(texto, numeroDocumento);
      }
      const [u] = await m.query(
        `SELECT COALESCE(MAX(numero_peca), 0) AS n, COALESCE(MAX(folha_final), 0) AS f FROM processo_pecas WHERE processo_id = $1::uuid`,
        [p.id],
      );
      const numeroPeca = Number(u.n) + 1;
      let arquivo = { arquivo_url: v.dados.arquivo_url, arquivo_nome: v.dados.arquivo_nome, paginas: v.dados.paginas };
      if (htmlFinal) arquivo = await this.gerarArquivoDaPeca(p, perfil, numeroPeca, titulo, htmlFinal, iaModelo, ehOficio);
      const folhas = folhasDaPeca(Number(u.f), arquivo.paginas);
      const repo = m.getRepository(ProcessoPeca);
      return repo.save(
        repo.create({
          processo_id: p.id,
          orgao_id: p.orgao_id,
          numero_peca: numeroPeca,
          etapa: chaveEtapa,
          tipo_peca: tipoPeca,
          titulo,
          texto,
          texto_html: htmlFinal || null,
          origem: html ? (iaModelo ? 'IA' : 'EDITOR') : 'ARQUIVO',
          ia_modelo: iaModelo,
          arquivo_url: arquivo.arquivo_url,
          arquivo_nome: arquivo.arquivo_nome,
          ...folhas,
          setor_autor_id: perfil.setor_id ?? null,
          numero_documento: numeroDocumento,
          criado_por_id: perfil.usuario_id ?? ator.id,
          criado_por_nome: perfil.nome,
        }),
      );
    });
    return { peca, ...(await this.fluxo(p)) };
  }

  /**
   * Processos COM VOCÊ: abertos, com tramitação própria, cuja posse atual é o seu
   * setor ou você (administrador do órgão vê todos com tramitação). Separa os
   * que aguardam recebimento dos já recebidos. Alimenta "Minhas tarefas".
   */
  async comigo(ator: Ator) {
    const orgaoId = ator.admin ? null : ator.orgaoId;
    if (!orgaoId) return { aguardando_recebimento: [], com_voce: [] };
    const perfil = await this.perfil(ator, orgaoId);
    const linhas: Array<{
      id: string; numero: string; objeto: string; tipo: string; aberto_em: Date; contrato_id: string | null;
      para_setor_id: string | null; para_setor_nome: string | null; para_usuario_id: string | null; para_usuario_nome: string | null;
      recebida_em: Date | null; despacho: string; movida_em: Date;
    }> = await this.ds.query(
      `SELECT p.id::text AS id, p.numero, p.objeto, p.tipo::text AS tipo, p.aberto_em, p.contrato_id::text AS contrato_id,
              m.para_setor_id::text AS para_setor_id, m.para_setor_nome, m.para_usuario_id::text AS para_usuario_id, m.para_usuario_nome,
              m.recebida_em, m.despacho, m.created_at AS movida_em
         FROM processos p
         JOIN LATERAL (SELECT * FROM processo_movimentacoes x WHERE x.processo_id = p.id ORDER BY x.sequencia DESC LIMIT 1) m ON true
        WHERE p.orgao_id::text = $1 AND p.situacao = 'ABERTO' AND p.tipo::text = ANY($2::text[])
        ORDER BY m.created_at DESC`,
      [orgaoId, [...TIPOS_COM_TRAMITACAO_PROPRIA]],
    );
    const minhas = linhas.filter((l) => {
      if (perfil.admin_orgao) return true;
      if (l.para_usuario_id && perfil.usuario_id && l.para_usuario_id === perfil.usuario_id) return true;
      return !!l.para_setor_id && !!perfil.setor_id && l.para_setor_id === perfil.setor_id && !l.para_usuario_id;
    });
    const item = (l: (typeof linhas)[number]) => ({
      id: l.id,
      numero: l.numero,
      objeto: l.objeto,
      tipo: l.tipo,
      contrato_id: l.contrato_id,
      esta_com: [l.para_setor_nome, l.para_usuario_nome].filter(Boolean).join(' · ') || 'Órgão',
      despacho: l.despacho,
      desde: l.recebida_em ?? l.movida_em,
      recebida: !!l.recebida_em,
    });
    return {
      aguardando_recebimento: minhas.filter((l) => !l.recebida_em).map(item),
      com_voce: minhas.filter((l) => !!l.recebida_em).map(item),
    };
  }

  /** PDF da peça feita no sistema, gravado na pasta privada `processo/<id>/`. */
  private async gerarArquivoDaPeca(p: Processo, perfil: Perfil, numeroPeca: number, titulo: string, html: string, iaModelo: string | null, assinatura = false) {
    const [org] = await this.ds.query(`SELECT nome, cidade, uf, logo_url, pecas_papel_timbrado FROM orgaos WHERE id::text = $1`, [p.orgao_id]);
    const pdf = await gerarPdfPeca({
      orgao_nome: org?.nome || 'Órgão',
      cidade: org?.cidade ?? null,
      uf: org?.uf ?? null,
      logo: org?.pecas_papel_timbrado ? null : this.logoDoOrgao(org?.logo_url),
      papel_timbrado: !!org?.pecas_papel_timbrado,
      setor_nome: await this.nomeDoSetor(perfil.setor_id),
      numero_processo: p.numero,
      titulo,
      blocos: blocosDaPeca(html),
      autor_nome: perfil.nome,
      autor_cargo: perfil.cargo,
      juntada_em: new Date(),
      ia_modelo: iaModelo,
      assinatura_eletronica: assinatura,
    });
    const nome = `peca-${numeroPeca}-${randomUUID()}.pdf`;
    const dir = path.join(diretorioDeGravacao('processo'), p.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), pdf);
    return { arquivo_url: `/api/uploads/processo/${p.id}/${nome}`, arquivo_nome: `${titulo.slice(0, 80)}.pdf`, paginas: Math.max(1, await contarPaginasPdf(pdf)) };
  }

  /** Bytes da logo do órgão (`/api/uploads/logos/x.png`), ou null se não há ou não deu para ler. */
  private logoDoOrgao(logoUrl: string | null | undefined): { bytes: Buffer; tipo: 'png' | 'jpg' } | null {
    const nome = String(logoUrl ?? '').match(/\/logos\/([^/?]+)$/)?.[1];
    if (!nome) return null;
    const ext = nome.toLowerCase().split('.').pop();
    if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') return null;
    const caminho = resolverArquivo(caminhoLogico(['logos', nome]));
    if (!caminho) return null;
    try {
      return { bytes: fs.readFileSync(caminho), tipo: ext === 'png' ? 'png' : 'jpg' };
    } catch (e) {
      this.logger.warn(`Logo do órgão não pôde ser lida para o PDF da peça: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** O que o modelo e a IA sabem do processo ao redigir a peça da etapa. */
  private async contextoDaPeca(ator: Ator, p: Processo, chaveEtapa: string | null): Promise<ContextoDaPeca> {
    const perfil = await this.perfil(ator, p.orgao_id);
    // Etapa de um nó do fluxo de processo (`no:<acao_id>`): não está nas etapas padrão
    // do ADITIVO/RENOVACAO; o modelo/rascunho tratam como peça avulsa (sem tipo de peça fixo).
    const ehEtapaDeNoDeFluxo = !!chaveEtapa && chaveEtapa.startsWith('no:');
    // Etapa do fluxo desenhado: o documento que ela produz e o modelo escolhido no desenho
    const doNo = ehEtapaDeNoDeFluxo ? await this.workflow.documentoDaEtapa(p.orgao_id, p.id, chaveEtapa!.slice(3)) : null;
    const etapa = chaveEtapa && !ehEtapaDeNoDeFluxo ? (await this.etapasDoProcesso(p)).find((e) => e.chave === chaveEtapa) ?? null : null;
    if (chaveEtapa && !ehEtapaDeNoDeFluxo && (!etapa || etapa.resultado)) throw new BadRequestException('Etapa inválida para redigir peça.');
    const [org] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [p.orgao_id]);
    const [c] = p.contrato_id
      ? await this.ds.query(`SELECT numero_contrato, objeto, fornecedor_razao_social, valor_global FROM contratos WHERE id::text = $1`, [p.contrato_id])
      : [];
    const pecas = await this.pecas(p);
    return {
      orgao_nome: org?.nome || 'Órgão',
      setor_nome: await this.nomeDoSetor(perfil.setor_id),
      numero_processo: p.numero,
      tipo_processo: p.tipo,
      objeto: p.objeto,
      // Ofício sem etapa: a peça é o próprio ofício (modelo e rascunho da IA de ofício)
      etapa_rotulo: doNo?.nome ?? etapa?.rotulo ?? (p.tipo === TipoProcesso.OFICIO ? 'Ofício' : 'Peça avulsa'),
      tipo_peca: doNo ? doNo.tipo_documento : etapa?.tipo_peca ?? (p.tipo === TipoProcesso.OFICIO ? TIPO_PECA_OFICIO : null),
      titulo_peca: doNo?.nome ?? etapa?.titulo_peca ?? etapa?.rotulo ?? (p.tipo === TipoProcesso.OFICIO ? 'Ofício' : 'Peça'),
      modelo_preferido_id: doNo?.modelo_documento_id ?? null,
      contrato: c ? { numero: c.numero_contrato, objeto: c.objeto ?? null, fornecedor: c.fornecedor_razao_social ?? null, valor_global: c.valor_global !== null && c.valor_global !== undefined ? Number(c.valor_global) : null } : null,
      pecas: pecas.map((x) => ({
        titulo: x.titulo,
        folhas: x.folha_inicial === x.folha_final ? `fl. ${x.folha_inicial}` : `fls. ${x.folha_inicial}–${x.folha_final}`,
        texto: x.texto ? x.texto.slice(0, 1500) : null,
      })),
      autor_nome: perfil.nome,
      autor_cargo: perfil.cargo,
    };
  }

  /**
   * Modelos da peça da etapa (os do órgão primeiro, depois os do sistema — tela
   * "Modelos de documento"), já com as variáveis do processo aplicadas; `html`
   * é o preferido. Sem modelo cadastrado, o texto padrão em código.
   */
  async modelo(ator: Ator, id: string, chaveEtapa: string | null) {
    const p = await this.carregar(ator, id);
    const c = await this.contextoDaPeca(ator, p, chaveEtapa);
    const cadastrados = c.tipo_peca
      ? await this.modelosRepo
          .createQueryBuilder('m')
          .where('m.tipo = :tipo AND m.ativo = true AND (m.orgao_id IS NULL OR m.orgao_id = :orgaoId)', { tipo: c.tipo_peca, orgaoId: p.orgao_id })
          .orderBy('m.orgao_id', 'DESC', 'NULLS LAST')
          .addOrderBy('m.updated_at', 'DESC')
          .getMany()
      : [];
    // O modelo escolhido no desenho do fluxo vai primeiro (é o que abre no editor)
    if (c.modelo_preferido_id) cadastrados.sort((a, b) => Number(b.id === c.modelo_preferido_id) - Number(a.id === c.modelo_preferido_id));
    const modelos = cadastrados
      .map((m) => ({ id: m.id, nome: m.nome, padrao_sistema: m.padrao_sistema, do_orgao: !!m.orgao_id, html: aplicarVariaveisDaPeca(htmlDoModelo(m.secoes || []), c) }))
      .filter((m) => m.html.trim());
    const html = modelos[0]?.html ?? modeloDaPeca(c);
    return { processo_id: p.id, etapa: chaveEtapa, titulo: c.titulo_peca, html, modelo_id: modelos[0]?.id ?? null, modelos, ia_disponivel: await this.ia.configurada() };
  }

  /** Salva o texto do editor como modelo do órgão para o tipo de peça da etapa (aparece na tela "Modelos de documento"). */
  async salvarModelo(ator: Ator, id: string, body: any) {
    const p = await this.carregar(ator, id);
    const c = await this.contextoDaPeca(ator, p, String(body?.etapa ?? '').trim() || null);
    if (!c.tipo_peca || !(Object.values(TipoDocumentoFaseInterna) as string[]).includes(c.tipo_peca)) {
      throw new BadRequestException('Esta etapa não tem tipo de peça com modelo.');
    }
    const nome = String(body?.nome ?? '').trim().slice(0, 200);
    if (nome.length < 3) throw new BadRequestException('Dê um nome ao modelo.');
    const html = htmlDaPecaSeguro(body?.html);
    if (!html) throw new BadRequestException('O modelo precisa de texto.');
    const perfil = await this.perfil(ator, p.orgao_id);
    const salvo = await this.modelosRepo.save(
      this.modelosRepo.create({
        orgao_id: p.orgao_id,
        tipo: c.tipo_peca as TipoDocumentoFaseInterna,
        nome,
        descricao: `Salvo do editor da peça no processo ${p.numero}.`,
        intro: null as any,
        secoes: [{ id: 'texto', titulo: c.titulo_peca, texto_padrao: html, obrigatorio: true }],
        padrao_sistema: false,
        ativo: true,
        versao: 1,
        criado_por_id: perfil.usuario_id ?? undefined,
        criado_por_nome: perfil.nome,
      }),
    );
    return { id: salvo.id, nome: salvo.nome, tipo: salvo.tipo };
  }

  /** Rascunho da peça pela IA: lê o processo, escreve e marca lacunas; nada é juntado sem revisão. */
  async rascunhoIa(ator: Ator, id: string, body: any) {
    const p = await this.carregar(ator, id);
    this.exigirAberto(p);
    if (!(await this.ia.configurada())) throw new ConflictException('A IA não está configurada neste servidor. Escreva a peça no editor ou anexe o arquivo.');
    const c = await this.contextoDaPeca(ator, p, String(body?.etapa ?? '').trim() || null);
    const orientacao = String(body?.orientacao ?? '').trim().slice(0, 2000) || null;
    const pedido = montarPromptDaPeca(c, orientacao);
    let resposta: { texto: string; modelo: string };
    try {
      resposta = await this.ia.gerarRascunhoJson(pedido.sistema, pedido.usuario, { maxTokens: 4000 });
    } catch (e) {
      this.logger.warn(`Rascunho da peça falhou (processo ${p.id}): ${e instanceof Error ? e.message : e}`);
      throw new ConflictException('A IA não respondeu agora. Tente de novo em instantes ou escreva a peça no editor.');
    }
    const lido = extrairJsonDaResposta(resposta.texto);
    if (!lido) throw new ConflictException('A IA devolveu um texto que não deu para aproveitar. Tente de novo ou escreva no editor.');
    return { processo_id: p.id, titulo: lido.titulo ?? c.titulo_peca, html: lido.html, ia_modelo: resposta.modelo, lacunas: (lido.html.match(/<mark>/g) || []).length };
  }

  /** Encerra o processo sem conteúdo; só quem está com ele (ou o administrador do órgão). */
  /** Rascunho da peça em elaboração (só quem está com o processo vê e grava). */
  async rascunho(ator: Ator, id: string) {
    const p = await this.carregar(ator, id);
    await this.exigirQuemEstaCom(ator, p);
    const [r] = await this.ds.query(`SELECT rascunho_peca FROM processos WHERE id = $1::uuid`, [p.id]);
    return { processo_id: p.id, rascunho: r?.rascunho_peca ?? null };
  }

  async salvarRascunho(ator: Ator, id: string, body: any) {
    const p = await this.carregar(ator, id);
    this.exigirAberto(p);
    const perfil = await this.exigirQuemEstaCom(ator, p);
    const html = htmlDaPecaSeguro(body?.html ?? '');
    const paraSetor = typeof body?.para_setor_id === 'string' && body.para_setor_id.trim() ? body.para_setor_id.trim() : null;
    if (paraSetor) {
      const [s] = await this.ds.query(`SELECT 1 FROM setores WHERE id::text = $1 AND orgao_id::text = $2`, [paraSetor, p.orgao_id]);
      if (!s) throw new BadRequestException('Setor de destino não pertence ao órgão.');
    }
    const rascunho = {
      titulo: String(body?.titulo ?? '').trim().slice(0, 300) || null,
      html,
      para_setor_id: paraSetor,
      salvo_em: new Date().toISOString(),
      salvo_por: perfil.nome,
    };
    await this.ds.query(`UPDATE processos SET rascunho_peca = $2::jsonb WHERE id = $1::uuid`, [p.id, JSON.stringify(rascunho)]);
    return { processo_id: p.id, rascunho };
  }

  /** Mesma regra do juntar: quem está com o processo (ou o administrador do órgão). */
  private async exigirQuemEstaCom(ator: Ator, p: Processo) {
    const perfil = await this.perfil(ator, p.orgao_id);
    const atual = await this.atual(p);
    if (!podeAtuar(perfil, atual, await this.chefeDoSetor(atual?.para_setor_id))) {
      throw new ForbiddenException('Só quem está com o processo (ou o administrador do órgão) pode ver ou alterar o rascunho.');
    }
    return perfil;
  }

  async encerrar(ator: Ator, id: string, motivo: string | null) {
    const p = await this.processos.obter(ator, id);
    if (temTramitacaoPropria(p.tipo) && p.situacao !== 'ENCERRADO') {
      const perfil = await this.perfil(ator, p.orgao_id);
      const atual = await this.atual(p);
      if (!podeAtuar(perfil, atual, await this.chefeDoSetor(atual?.para_setor_id))) {
        throw new ForbiddenException('Só quem está com o processo (ou o administrador do órgão) pode encerrá-lo.');
      }
    }
    return this.processos.encerrar(ator, id, motivo);
  }

  // ==========================================================================
  // Leituras (mesmo formato das rotas genéricas do processo)
  // ==========================================================================

  private async movimentacoes(p: Processo): Promise<ProcessoMovimentacao[]> {
    return this.ds.query(`SELECT * FROM processo_movimentacoes WHERE processo_id = $1::uuid ORDER BY sequencia ASC`, [p.id]);
  }

  private async pecas(p: Processo, m?: EntityManager): Promise<ProcessoPeca[]> {
    return (m ?? this.ds.manager).query(`SELECT * FROM processo_pecas WHERE processo_id = $1::uuid ORDER BY numero_peca ASC`, [p.id]);
  }

  async tramitacao(p: Processo, ator?: Ator) {
    const [movs, pecas] = await Promise.all([this.movimentacoes(p), this.pecas(p)]);
    const atual = movs.length ? movs[movs.length - 1] : null;
    let podeAgir = false;
    let podeReceber = false;
    if (ator && atual && p.situacao === 'ABERTO') {
      try {
        const perfil = await this.perfil(ator, p.orgao_id);
        const autorizado = podeAtuar(perfil, atual, await this.chefeDoSetor(atual.para_setor_id));
        podeReceber = autorizado && !atual.recebida_em;
        podeAgir = autorizado && (!!atual.recebida_em || perfil.admin_orgao);
      } catch {
        /* sem perfil → só leitura */
      }
    }
    return {
      processo_id: p.id,
      disponivel: true,
      situacao_posse: situacaoDaPosse(atual),
      com_quem_esta: atual
        ? {
            setor_id: atual.para_setor_id,
            setor_nome: atual.para_setor_nome,
            usuario_id: atual.para_usuario_id,
            usuario_nome: atual.para_usuario_nome,
            texto: textoDoDestino(atual),
            recebida: !!atual.recebida_em,
            desde: atual.recebida_em ?? atual.created_at,
            enviado_por: atual.tipo === 'ABERTURA' ? null : atual.de_usuario_nome,
            despacho: atual.tipo === 'ABERTURA' ? null : atual.despacho,
          }
        : null,
      pode_agir: podeAgir,
      pode_receber: podeReceber,
      atual,
      movimentacoes: movs,
      linha_do_tempo: montarLinhaDoTempo(movs, pecas, p.situacao === 'ENCERRADO' && p.encerrado_em ? { em: p.encerrado_em, motivo: p.motivo_encerramento } : null),
    };
  }

  async autos(p: Processo) {
    const pecas = await this.pecas(p);
    const [u] = await this.ds.query(`SELECT nome FROM setores WHERE id::text = $1`, [p.setor_origem_id ?? '']);
    return {
      processo_id: p.id,
      disponivel: true,
      regime: 'CRONOLOGICO',
      autuacao: textoDeAutuacao({ numero: p.numero, objeto: p.objeto, aberto_por_nome: p.aberto_por_nome, setor_nome: u?.nome ?? null }),
      total_folhas: pecas.length ? pecas[pecas.length - 1].folha_final : 0,
      juntadas: pecas,
    };
  }

  async documentos(p: Processo) {
    return { processo_id: p.id, disponivel: true, documentos: await this.pecas(p) };
  }

  private async etapasDoProcesso(p: Processo, m?: EntityManager): Promise<EtapaCalculada[]> {
    if (!etapasPadraoDe(p.tipo).length) return [];
    const pecas = await this.pecas(p, m);
    const chaves = new Set(pecas.map((x) => x.etapa).filter((x): x is string => !!x));
    return calcularEtapas(p.tipo, chaves, !!p.referencia_id, p.situacao === 'ENCERRADO');
  }

  /** Etapas padrão do tipo (ADITIVO/RENOVACAO) com o estado de cada uma; AVULSO não tem etapas. */
  async fluxo(p: Processo) {
    const calculadas = await this.etapasDoProcesso(p);
    const setores: Array<{ id: string; nome: string }> = calculadas.length
      ? await this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 ORDER BY nome ASC`, [p.orgao_id])
      : [];
    const etapas = calculadas.map((e) => {
      const s = sugerirSetor(e.setor_palavras, setores);
      return { ...e, setor_sugerido: s ? { id: s.id, nome: s.nome } : null };
    });
    return { processo_id: p.id, disponivel: true, tem_fluxo: etapas.length > 0, fluxo_padrao: true, retrato: null, etapas, etapa_atual: etapas.find((e) => e.estado === 'ATUAL') ?? null };
  }

  /** Tarefas derivadas das etapas (a pendente é a "vez" de quem está com o processo). */
  async tarefas(p: Processo) {
    const etapas = await this.etapasDoProcesso(p);
    return {
      processo_id: p.id,
      disponivel: true,
      tarefas: etapas.map((e) => ({
        chave: e.chave,
        titulo: e.resultado ? `Cadastrar o ${e.rotulo.toLowerCase()}` : e.rotulo,
        tipo: e.resultado ? 'RESULTADO' : 'PECA',
        tipo_peca: e.tipo_peca,
        titulo_peca: e.titulo_peca,
        status: e.estado === 'CONCLUIDA' ? 'CONCLUIDA' : e.estado === 'ATUAL' ? 'PENDENTE' : 'AGUARDANDO',
        ordem: e.ordem,
      })),
    };
  }

  /** Setores e pessoas do órgão para escolher o destino, com a sugestão para a etapa atual. */
  async destinos(ator: Ator, id: string) {
    const p = await this.carregar(ator, id);
    const [setores, usuarios] = await Promise.all([
      this.ds.query(`SELECT id::text AS id, nome, chefe_usuario_id::text AS chefe_usuario_id FROM setores WHERE orgao_id::text = $1 ORDER BY nome ASC`, [p.orgao_id]),
      this.ds.query(`SELECT id::text AS id, nome, cargo, setor_id::text AS setor_id FROM usuarios WHERE orgao_id::text = $1 AND ativo = true ORDER BY nome ASC LIMIT 500`, [p.orgao_id]),
    ]);
    const etapa = etapaAtual(await this.etapasDoProcesso(p));
    const achado = etapa ? sugerirSetor(etapa.setor_palavras, setores) : null;
    return {
      processo_id: p.id,
      setores,
      usuarios,
      sugerido: achado ? { setor_id: achado.id, setor_nome: achado.nome, motivo: `Responsável pela etapa “${etapa!.rotulo}”.` } : null,
    };
  }

  // ==========================================================================
  // Avisos
  // ==========================================================================

  private async avisarChegada(p: Processo, mov: ProcessoMovimentacao, remetenteId: string | null) {
    if (process.env.FASE_INTERNA_TRAMITACAO_NOTIFICAR === 'false') return;
    try {
      const chefe = await this.chefeDoSetor(mov.para_setor_id);
      const candidatos: Array<{ id: string; email: string | null; telefone: string | null; setor_id: string | null }> = await this.ds.query(
        `SELECT id::text AS id, email, telefone, setor_id::text AS setor_id FROM usuarios
          WHERE orgao_id::text = $1 AND ativo = true
            AND (id::text = $2 OR ($3::text IS NOT NULL AND setor_id::text = $3::text) OR id::text = $4)
          LIMIT 60`,
        [p.orgao_id, mov.para_usuario_id ?? '', mov.para_setor_id ?? null, chefe ?? ''],
      );
      const para = escolherDestinatarios(mov, candidatos, chefe, remetenteId);
      if (!para.length) return;
      const link = `/orgao/processo/${p.id}`;
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://portaldcp.com.br';
      const devolucao = mov.tipo === 'DEVOLUCAO';
      const titulo = `Processo ${p.numero} ${devolucao ? 'devolvido' : 'enviado'} para ${mov.para_usuario_id ? 'você' : `o setor ${mov.para_setor_nome ?? ''}`.trim()}`;
      const mensagem = `${mov.de_usuario_nome ? `${mov.de_usuario_nome}: ` : ''}${mov.despacho}`;
      await this.notificacoes.criarParaMultiplos(
        para.map((u) => ({ id: u.id, email: u.email ?? undefined, telefone: u.telefone ?? undefined })),
        {
          orgao_id: p.orgao_id,
          tipo: TipoNotificacao.PROCESSO_TRAMITADO,
          titulo,
          mensagem,
          prioridade: PrioridadeNotificacao.NORMAL,
          entidade_tipo: 'PROCESSO',
          entidade_id: p.id,
          link,
          enviar_email: true,
          metadata: {
            evento: 'CHEGADA',
            movimentacao_id: mov.id,
            whatsapp_text: `*${titulo}*\n${mensagem}\n\nAbra o processo para ver o despacho.`,
            whatsapp_url: `${appUrl}${link}`,
          },
        },
      );
    } catch (e: any) {
      this.logger.warn(`Aviso de chegada do processo ${p.id} não enviado: ${e?.message ?? e}`);
    }
  }
}
