import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  DocumentoFaseInterna,
  OrigemDocumento,
  StatusDocumento,
  TipoDocumentoFaseInterna,
} from './entities/documento-fase-interna.entity';
import { DocumentoOrgao, TipoDocumentoOrgao } from './entities/documento-orgao.entity';
import { SITUACOES_TERMINAIS } from '../licitacoes/entities/licitacao.entity';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';
import { basesDeLeitura, caminhoContido, diretorioDeGravacao, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { PortalAssinaturasService } from '../portal-assinaturas/portal-assinaturas.service';
import { GeradorDocumentoService } from './gerador-documento.service';
import type { Ator } from '../auth/acesso/ator';
import {
  dataDocumentoDaAssinatura,
  normalizarSignatariosInformados,
  pareceSerPdf,
  planoNovaVersao,
  validarDataDocumentoAnexo,
} from './peca-regras';
import { TITULO_DOCUMENTO } from './documentos-obrigatorios';
import { atribuirFolhas, contarPaginasPdf } from './folhas-autos';

/** Limite do PDF anexado (MB) — FASE_INTERNA_ANEXO_MAX_MB. */
export const ANEXO_MAX_BYTES = Math.max(1, Number(process.env.FASE_INTERNA_ANEXO_MAX_MB) || 25) * 1024 * 1024;

/** Peças da FASE EXTERNA que também entram por aqui (depois da divulgação). */
export const TIPOS_PECA_FASE_EXTERNA: TipoDocumentoFaseInterna[] = [TipoDocumentoFaseInterna.PARECER_FASE_EXTERNA];

/** Pasta (sensível) dos anexos da peça: `licitacoes/<licitacaoId>/…` — dono = órgão da licitação. */
const PASTA_PECAS = 'licitacoes';
/** Pasta (sensível) dos documentos do órgão: `fase-interna/<orgaoId>/…`. */
const PASTA_DOC_ORGAO = 'fase-interna';

const TIPOS_VALIDOS = new Set<string>(Object.values(TipoDocumentoFaseInterna));

export interface ArquivoRecebido {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export interface MetadadosAnexo {
  numero_peca?: string;
  data_documento?: string;
  signatarios?: unknown;
  observacao?: string;
  titulo?: string;
}

const idDoAtor = (ator: Ator | null | undefined) => (ator ? String(ator.usuarioId ?? ator.id ?? '') || null : null);

/** Título legível da peça (catálogo único — documentos-obrigatorios.ts). */
export function tituloDaPeca(tipo: TipoDocumentoFaseInterna): string {
  return TITULO_DOCUMENTO[tipo] ?? String(tipo);
}

/**
 * PEÇAS DA FASE INTERNA — "fazer aqui OU anexar" (Entrega 1):
 *  - anexo em PDF da peça feita fora (versão, data da peça, folhas, SHA-256);
 *  - portaria de designação do órgão (vigência anual) referenciada no processo;
 *  - assinatura com vários signatários pelo portal de assinaturas (a peça fica
 *    ASSINADA quando todos assinam; data e hash registrados).
 * Autorização: DonoFaseInternaGuard no controller (órgão dono; ator do JWT).
 */
@Injectable()
export class PecasFaseInternaService implements OnModuleInit {
  private readonly logger = new Logger(PecasFaseInternaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    @InjectRepository(DocumentoOrgao) private readonly docOrgaoRepo: Repository<DocumentoOrgao>,
    private readonly assinaturas: PortalAssinaturasService,
    private readonly gerador: GeradorDocumentoService,
  ) {}

  onModuleInit() {
    // Conclusão no portal de assinaturas (todos assinaram) → peça ASSINADA
    this.assinaturas.registrarAoConcluir((docId, url) => this.aoConcluirAssinatura(docId, url));
  }

  // ==========================================================================
  // ARQUIVOS
  // ==========================================================================

  private gravar(pasta: string, sub: string, prefixo: string, buffer: Buffer): string {
    const nome = `${prefixo}-${randomUUID()}.pdf`;
    const dir = path.join(diretorioDeGravacao(pasta), sub);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), buffer);
    return `${pasta}/${sub}/${nome}`;
  }

  private apagar(rel: string | null) {
    const p = rel ? resolverArquivoDeUrl(rel) : null;
    if (p) fs.promises.unlink(p).catch(() => undefined);
  }

  /** Arquivo físico de uma referência gravada (lógica, URL ou caminho legado), sempre dentro das pastas de upload. */
  private caminhoFisico(ref: string | null | undefined): string | null {
    if (!ref) return null;
    const porUrl = resolverArquivoDeUrl(ref);
    if (porUrl) return porUrl;
    const abs = path.resolve(ref);
    const bases = [...basesDeLeitura(), path.resolve(process.cwd(), 'uploads'), path.resolve(process.env.UPLOAD_PATH || './uploads/documentos')];
    for (const base of bases) {
      const rel = path.relative(base, abs);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        const contido = caminhoContido(base, rel);
        if (contido && fs.existsSync(contido)) return contido;
      }
    }
    return null;
  }

  private async validarPdf(arquivo: ArquivoRecebido | null | undefined): Promise<{ buffer: Buffer; paginas: number; hash: string }> {
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo PDF da peça (campo "arquivo").');
    const nome = String(arquivo.originalname || '').toLowerCase();
    if ((arquivo.mimetype && arquivo.mimetype !== 'application/pdf') || (nome && !nome.endsWith('.pdf')) || !pareceSerPdf(arquivo.buffer)) {
      throw new BadRequestException('Só é aceito arquivo PDF.');
    }
    if (arquivo.buffer.length > ANEXO_MAX_BYTES) {
      throw new BadRequestException(`O PDF passa do limite de ${Math.round(ANEXO_MAX_BYTES / 1024 / 1024)} MB.`);
    }
    let paginas: number;
    try {
      paginas = await contarPaginasPdf(arquivo.buffer);
    } catch {
      throw new BadRequestException('O arquivo não é um PDF válido (não foi possível ler as páginas).');
    }
    return { buffer: arquivo.buffer, paginas, hash: createHash('sha256').update(arquivo.buffer).digest('hex') };
  }

  // ==========================================================================
  // ANEXAR PEÇA FEITA FORA ("Anexar PDF")
  // ==========================================================================

  private tipoValido(tipo: string): TipoDocumentoFaseInterna {
    if (!TIPOS_VALIDOS.has(tipo)) throw new BadRequestException(`Tipo de peça desconhecido: ${tipo}`);
    return tipo as TipoDocumentoFaseInterna;
  }

  private async licitacaoParaPeca(licitacaoId: string, tipo: TipoDocumentoFaseInterna) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, fase::text AS fase, situacao::text AS situacao,
              COALESCE(ano, EXTRACT(YEAR FROM created_at))::int AS exercicio
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (SITUACOES_TERMINAIS.includes(lic.situacao)) {
      throw new ConflictException(`Processo encerrado (situação ${lic.situacao}) — as peças não mudam mais.`);
    }
    if (!TIPOS_PECA_FASE_EXTERNA.includes(tipo) && !ehFaseInterna(lic.fase)) {
      throw new ConflictException('A fase interna deste processo já foi encerrada (processo divulgado) — a peça não pode mais ser trocada.');
    }
    return lic as { id: string; orgao_id: string; fase: string; situacao: string; exercicio: number };
  }

  /**
   * Grava a peça como nova VERSÃO do tipo (a atual vira SUBSTITUIDO), já com
   * as folhas. Tudo numa transação; devolve a peça e a versão substituída.
   */
  private async gravarNovaVersao(
    licitacaoId: string,
    tipo: TipoDocumentoFaseInterna,
    dados: Partial<DocumentoFaseInterna>,
    paginas: number | null,
  ): Promise<{ doc: DocumentoFaseInterna; anterior: DocumentoFaseInterna | null }> {
    return this.ds.transaction(async (m) => {
      await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
      const repo = m.getRepository(DocumentoFaseInterna);
      const atual = await repo.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
      const plano = planoNovaVersao(atual);
      if (atual) {
        await repo.update(atual.id, { versao_atual: false, status: StatusDocumento.SUBSTITUIDO });
      }
      const doc = await repo.save(
        repo.create({
          licitacao_id: licitacaoId,
          tipo,
          titulo: tituloDaPeca(tipo),
          versao: plano.versao,
          versao_anterior_id: plano.versao_anterior_id as any,
          versao_atual: true,
          obrigatorio: atual?.obrigatorio ?? false,
          ...dados,
        }),
      );
      if (paginas !== null) {
        const faixa = await atribuirFolhas(m, licitacaoId, doc.id, paginas);
        Object.assign(doc, faixa, { total_paginas: Math.max(1, paginas) });
      }
      return { doc, anterior: atual };
    });
  }

  /** Assinatura pendente da versão substituída: cancela no portal (não fica pedido órfão). */
  private async cancelarAssinaturaPendente(anterior: DocumentoFaseInterna | null, orgaoId: string) {
    if (anterior?.documento_assinatura_id && anterior.status === StatusDocumento.AGUARDANDO_ASSINATURA) {
      await this.assinaturas
        .cancelarDocumento(anterior.documento_assinatura_id, orgaoId)
        .catch((e: any) => this.logger.warn(`Assinatura pendente da versão ${anterior.versao} não cancelada: ${e?.message ?? e}`));
    }
  }

  async anexarPeca(
    licitacaoId: string,
    tipoParam: string,
    arquivo: ArquivoRecebido | null | undefined,
    meta: MetadadosAnexo,
    ator: Ator,
  ): Promise<DocumentoFaseInterna> {
    const tipo = this.tipoValido(tipoParam);
    const lic = await this.licitacaoParaPeca(licitacaoId, tipo);
    const data = validarDataDocumentoAnexo(meta?.data_documento);
    if (!data.ok) throw new BadRequestException(data.erro);
    const pdf = await this.validarPdf(arquivo);
    const numero = String(meta?.numero_peca ?? '').trim().slice(0, 120) || null;
    const observacao = String(meta?.observacao ?? '').trim().slice(0, 4000) || null;
    const signatarios = normalizarSignatariosInformados(meta?.signatarios);

    const rel = this.gravar(PASTA_PECAS, licitacaoId, `peca-${tipo.toLowerCase()}`, pdf.buffer);
    try {
      const { doc, anterior } = await this.gravarNovaVersao(
        licitacaoId,
        tipo,
        {
          titulo: String(meta?.titulo ?? '').trim().slice(0, 250) || tituloDaPeca(tipo),
          descricao: observacao ?? (numero ? `${tituloDaPeca(tipo)} — ${numero}` : `${tituloDaPeca(tipo)} (anexada)`),
          origem: OrigemDocumento.IMPORTADO_ARQUIVO,
          status: StatusDocumento.IMPORTADO,
          sistema_origem: 'anexo',
          data_importacao: new Date(),
          data_documento: data.data,
          numero_peca: numero,
          signatarios_informados: signatarios.length ? signatarios : null,
          observacao_anexo: observacao,
          nome_arquivo: String(arquivo?.originalname || 'peca.pdf').slice(0, 250),
          caminho_arquivo: rel,
          tipo_mime: 'application/pdf',
          tamanho_bytes: pdf.buffer.length,
          hash_arquivo: pdf.hash,
          criado_por_id: idDoAtor(ator) as any,
        },
        pdf.paginas,
      );
      await this.cancelarAssinaturaPendente(anterior, lic.orgao_id);
      return doc;
    } catch (e) {
      this.apagar(rel);
      throw e;
    }
  }

  /** Arquivo da peça (anexo, PDF gerado ou assinado) para download pelo órgão dono. */
  async arquivoDaPeca(documentoId: string): Promise<{ caminho: string; nome: string }> {
    const doc = await this.docRepo.findOne({ where: { id: documentoId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    const caminho = this.caminhoFisico(doc.caminho_arquivo) ?? this.caminhoFisico(doc.arquivo_pdf_path);
    if (!caminho) throw new NotFoundException('A peça não tem arquivo');
    const nome = (doc.nome_arquivo || `${doc.tipo}-v${doc.versao}.pdf`).replace(/[^\w.\-() ]+/g, '_');
    return { caminho, nome };
  }

  // ==========================================================================
  // PORTARIA DE DESIGNAÇÃO (documento do órgão, vigência anual)
  // ==========================================================================

  async listarPortarias(orgaoId: string, todas = false): Promise<DocumentoOrgao[]> {
    return this.docOrgaoRepo.find({
      where: { orgao_id: orgaoId, tipo: TipoDocumentoOrgao.PORTARIA_DESIGNACAO, ...(todas ? {} : { ativo: true }) },
      order: { exercicio: 'DESC', versao: 'DESC' },
    });
  }

  async anexarPortaria(
    orgaoId: string,
    arquivo: ArquivoRecebido | null | undefined,
    meta: MetadadosAnexo & { exercicio?: string | number; vigencia_inicio?: string; vigencia_fim?: string },
    ator: Ator,
  ): Promise<DocumentoOrgao> {
    const numero = String(meta?.numero_peca ?? '').trim().slice(0, 120);
    if (!numero) throw new BadRequestException('Informe o número da portaria (ex.: "Portaria 012/2025").');
    const data = validarDataDocumentoAnexo(meta?.data_documento);
    if (!data.ok) throw new BadRequestException(data.erro);
    const exercicio = Number(meta?.exercicio) || Number(data.dia.slice(0, 4));
    if (!Number.isInteger(exercicio) || exercicio < 2021 || exercicio > new Date().getFullYear() + 1) {
      throw new BadRequestException('Exercício da portaria inválido.');
    }
    const dia = (v: unknown, padrao: string) => {
      const t = String(v ?? '').trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : padrao;
    };
    const vigenciaInicio = dia(meta?.vigencia_inicio, `${exercicio}-01-01`);
    const vigenciaFim = dia(meta?.vigencia_fim, `${exercicio}-12-31`);
    if (vigenciaFim < vigenciaInicio) throw new BadRequestException('O fim da vigência é anterior ao início.');
    const pdf = await this.validarPdf(arquivo);
    const signatarios = normalizarSignatariosInformados(meta?.signatarios);
    const rel = this.gravar(PASTA_DOC_ORGAO, orgaoId, 'portaria-designacao', pdf.buffer);
    try {
      return await this.ds.transaction(async (m) => {
        const repo = m.getRepository(DocumentoOrgao);
        const atual = await repo.findOne({
          where: { orgao_id: orgaoId, tipo: TipoDocumentoOrgao.PORTARIA_DESIGNACAO, exercicio, ativo: true },
          order: { versao: 'DESC' },
        });
        if (atual) await repo.update(atual.id, { ativo: false });
        return repo.save(
          repo.create({
            orgao_id: orgaoId,
            tipo: TipoDocumentoOrgao.PORTARIA_DESIGNACAO,
            numero,
            titulo: `Portaria de designação do agente de contratação e equipe — ${numero}`,
            exercicio,
            data_documento: data.data,
            vigencia_inicio: vigenciaInicio,
            vigencia_fim: vigenciaFim,
            caminho_arquivo: rel,
            nome_arquivo: String(arquivo?.originalname || 'portaria.pdf').slice(0, 250),
            hash_arquivo: pdf.hash,
            tamanho_bytes: pdf.buffer.length,
            total_paginas: pdf.paginas,
            signatarios_informados: signatarios.length ? signatarios : null,
            observacao: String(meta?.observacao ?? '').trim().slice(0, 4000) || null,
            versao: (atual?.versao ?? 0) + 1,
            substitui_documento_id: atual?.id ?? null,
            ativo: true,
            criado_por_id: idDoAtor(ator),
          }),
        );
      });
    } catch (e) {
      this.apagar(rel);
      throw e;
    }
  }

  /** Portaria do órgão do ator (outro órgão → 404, sem confirmar existência). */
  async portariaDoOrgao(id: string, orgaoId: string | null, admin: boolean): Promise<DocumentoOrgao> {
    const p = await this.docOrgaoRepo.findOne({ where: { id } }).catch(() => null);
    if (!p || (!admin && p.orgao_id !== orgaoId)) throw new NotFoundException('Portaria não encontrada');
    return p;
  }

  async arquivoDaPortaria(id: string, orgaoId: string | null, admin: boolean): Promise<{ caminho: string; nome: string }> {
    const p = await this.portariaDoOrgao(id, orgaoId, admin);
    const caminho = this.caminhoFisico(p.caminho_arquivo);
    if (!caminho) throw new NotFoundException('Arquivo da portaria não encontrado');
    return { caminho, nome: (p.nome_arquivo || 'portaria.pdf').replace(/[^\w.\-() ]+/g, '_') };
  }

  /**
   * Junta ao processo a portaria de designação do órgão (peça DP) — sem copiar
   * o arquivo: a peça REFERENCIA o documento do órgão. Sem `portariaId`, usa a
   * portaria ativa do exercício do processo.
   */
  async vincularPortaria(licitacaoId: string, portariaId: string | null | undefined, ator: Ator): Promise<DocumentoFaseInterna> {
    const tipo = TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO;
    const lic = await this.licitacaoParaPeca(licitacaoId, tipo);
    let portaria: DocumentoOrgao | null;
    if (portariaId) {
      portaria = await this.docOrgaoRepo.findOne({ where: { id: portariaId } }).catch(() => null);
      if (!portaria || portaria.orgao_id !== lic.orgao_id) throw new NotFoundException('Portaria não encontrada');
      if (!portaria.ativo) throw new ConflictException('Esta portaria foi substituída — use a versão vigente.');
    } else {
      portaria = await this.docOrgaoRepo.findOne({
        where: { orgao_id: lic.orgao_id, tipo: TipoDocumentoOrgao.PORTARIA_DESIGNACAO, exercicio: lic.exercicio, ativo: true },
        order: { versao: 'DESC' },
      });
      if (!portaria) throw new NotFoundException(`O órgão não tem portaria de designação cadastrada para ${lic.exercicio}.`);
    }
    const { doc, anterior } = await this.gravarNovaVersao(
      licitacaoId,
      tipo,
      {
        titulo: portaria.titulo,
        descricao: `${portaria.titulo} (vigência ${portaria.vigencia_inicio} a ${portaria.vigencia_fim ?? 'indeterminada'})`,
        origem: OrigemDocumento.IMPORTADO_ARQUIVO,
        status: StatusDocumento.IMPORTADO,
        sistema_origem: 'documentos_orgao',
        id_externo: portaria.id,
        documento_orgao_id: portaria.id,
        data_importacao: new Date(),
        data_documento: portaria.data_documento,
        numero_peca: portaria.numero,
        signatarios_informados: portaria.signatarios_informados,
        nome_arquivo: portaria.nome_arquivo ?? 'portaria.pdf',
        caminho_arquivo: portaria.caminho_arquivo,
        tipo_mime: 'application/pdf',
        tamanho_bytes: Number(portaria.tamanho_bytes) || (null as any),
        hash_arquivo: portaria.hash_arquivo,
        criado_por_id: idDoAtor(ator) as any,
      },
      portaria.total_paginas ?? 1,
    );
    await this.cancelarAssinaturaPendente(anterior, lic.orgao_id);
    return doc;
  }

  // ==========================================================================
  // ASSINATURA COM VÁRIOS SIGNATÁRIOS
  // ==========================================================================

  /**
   * Envia a peça GERADA no sistema para assinatura: gera o PDF, abre o
   * documento no portal de assinaturas com os signatários (usuários ativos do
   * órgão, cada um com o seu papel) e deixa a peça AGUARDANDO_ASSINATURA. Ela
   * só fica ASSINADA quando TODOS assinam (aoConcluirAssinatura).
   */
  async enviarParaAssinatura(
    licitacaoId: string,
    tipoParam: string,
    corpo: { signatarios?: Array<{ usuario_id?: string; papel?: string }> },
    ator: Ator,
  ): Promise<DocumentoFaseInterna> {
    const tipo = this.tipoValido(tipoParam);
    const lic = await this.licitacaoParaPeca(licitacaoId, tipo);
    const doc = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
    if (!doc) throw new NotFoundException('A peça ainda não foi elaborada — faça a peça antes de enviar para assinatura.');
    if (doc.origem !== OrigemDocumento.INTERNO) {
      throw new BadRequestException('Peça anexada já vem assinada fora do sistema — a assinatura aqui é para peça feita no sistema.');
    }
    if (doc.status === StatusDocumento.ASSINADO) throw new ConflictException('A peça já está assinada. Para mudar, faça nova versão.');
    if (doc.status === StatusDocumento.AGUARDANDO_ASSINATURA) throw new ConflictException('A peça já está aguardando as assinaturas.');
    if (doc.dados_estruturados?.nao_se_aplica) throw new BadRequestException('Peça marcada como "não se aplica".');
    if (!String(doc.descricao ?? '').trim() && !(doc.dados_estruturados && Object.keys(doc.dados_estruturados).length)) {
      throw new BadRequestException('A peça está vazia.');
    }

    const pedidos = Array.isArray(corpo?.signatarios) ? corpo.signatarios : [];
    if (!pedidos.length) throw new BadRequestException('Informe quem assina (usuário e papel).');
    if (pedidos.length > 15) throw new BadRequestException('No máximo 15 signatários por peça.');
    const vistos = new Set<string>();
    const signatarios: Array<{ usuario_id: string; nome: string; papel: string; email: string | null; cpf: string | null }> = [];
    for (const p of pedidos) {
      const usuarioId = String(p?.usuario_id ?? '').trim();
      const papel = String(p?.papel ?? '').trim().slice(0, 120);
      if (!usuarioId || !papel) throw new BadRequestException('Cada signatário precisa de usuário e papel (ex.: "Presidente").');
      if (vistos.has(usuarioId)) throw new BadRequestException('Signatário repetido.');
      vistos.add(usuarioId);
      const [u] = await this.ds.query(
        `SELECT id::text AS id, nome, email, cpf FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
        [usuarioId, lic.orgao_id],
      );
      if (!u) throw new BadRequestException('Signatário deve ser usuário ativo do órgão do processo.');
      if (!u.email) throw new BadRequestException(`O usuário ${u.nome} não tem e-mail cadastrado (necessário para assinar).`);
      signatarios.push({ usuario_id: u.id, nome: u.nome, papel, email: u.email, cpf: u.cpf ?? null });
    }

    // PDF da peça (gerador da fase interna) copiado para a pasta privada do processo
    const gerado = await this.gerador.gerarPdf(doc.id);
    const buffer = fs.readFileSync(gerado.caminho);
    const paginas = await contarPaginasPdf(buffer).catch(() => 1);
    const rel = this.gravar(PASTA_PECAS, licitacaoId, `assinatura-${tipo.toLowerCase()}-v${doc.versao}`, buffer);
    const hash = createHash('sha256').update(buffer).digest('hex');

    const docAss = await this.assinaturas.criarDocumento(
      lic.orgao_id,
      idDoAtor(ator) ?? lic.orgao_id,
      {
        titulo: `${doc.titulo || tituloDaPeca(tipo)} — v${doc.versao}`.slice(0, 250),
        descricao: `Peça da fase interna (${tituloDaPeca(tipo)}). Fica assinada quando todos os signatários assinarem.`,
        signatarios: signatarios.map((s) => ({
          nome: s.nome,
          email: s.email ?? undefined,
          cpf_cnpj: s.cpf ?? undefined,
          is_orgao_user: true,
          papel: s.papel,
          pagina_assinatura: paginas,
        })),
      } as any,
      rel,
    );
    await this.docRepo.update(doc.id, {
      status: StatusDocumento.AGUARDANDO_ASSINATURA,
      documento_assinatura_id: docAss.id,
      signatarios_exigidos: signatarios.map(({ cpf: _c, ...s }) => s),
      exige_assinatura: true,
      totalmente_assinado: false,
      arquivo_pdf_path: rel,
      hash_arquivo: hash,
      total_paginas: paginas,
    });
    await this.assinaturas.dispararNotificacoesAssinatura(docAss.id).catch((e: any) =>
      this.logger.warn(`Notificação de assinatura da peça ${tipo} não enviada: ${e?.message ?? e}`),
    );
    return this.docRepo.findOneOrFail({ where: { id: doc.id } });
  }

  /** Situação da assinatura da peça (quem já assinou, quem falta). */
  async situacaoAssinatura(licitacaoId: string, tipoParam: string) {
    const tipo = this.tipoValido(tipoParam);
    const doc = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo, versao_atual: true } });
    if (!doc) throw new NotFoundException('Peça não encontrada');
    if (!doc.documento_assinatura_id) return { documento_id: doc.id, status: doc.status, signatarios: [] };
    const sigs: any[] = await this.ds.query(
      `SELECT nome, email, papel, status::text AS status, data_assinatura FROM signatarios_documento WHERE documento_id::text = $1 ORDER BY created_at, nome`,
      [doc.documento_assinatura_id],
    );
    return {
      documento_id: doc.id,
      documento_assinatura_id: doc.documento_assinatura_id,
      status: doc.status,
      data_documento: doc.data_documento,
      hash_arquivo: doc.hash_arquivo,
      folha_inicial: doc.folha_inicial,
      folha_final: doc.folha_final,
      signatarios: sigs.map((s) => ({ nome: s.nome, papel: s.papel, status: s.status, data_assinatura: s.data_assinatura })),
    };
  }

  /**
   * Todos assinaram (ouvinte do portal): a peça fica ASSINADA com a data da
   * última assinatura, o hash e o arquivo assinados e as folhas dos autos.
   */
  async aoConcluirAssinatura(documentoAssinaturaId: string, arquivoAssinadoUrl?: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { documento_assinatura_id: documentoAssinaturaId } });
    if (!doc) return;
    if (!doc.versao_atual || doc.status !== StatusDocumento.AGUARDANDO_ASSINATURA) {
      this.logger.warn(`Assinatura concluída para peça ${doc.id} que não aguarda mais assinatura (versão ${doc.versao}, ${doc.status}) — ignorada`);
      return;
    }
    const [docAss] = await this.ds.query(`SELECT documento_hash FROM documentos_assinatura WHERE id::text = $1`, [documentoAssinaturaId]);
    const sigs: any[] = await this.ds.query(
      `SELECT nome, email, cpf_cnpj, papel, data_assinatura FROM signatarios_documento WHERE documento_id::text = $1 AND status::text = 'ASSINADO' ORDER BY data_assinatura`,
      [documentoAssinaturaId],
    );
    const exigidos = doc.signatarios_exigidos ?? [];
    const dataDocumento = dataDocumentoDaAssinatura(sigs.map((s) => s.data_assinatura)) ?? new Date();

    let caminhoAssinado = doc.arquivo_pdf_path;
    let hash = doc.hash_arquivo;
    let paginas = doc.total_paginas ?? 1;
    const fisico = arquivoAssinadoUrl ? resolverArquivoDeUrl(arquivoAssinadoUrl) : null;
    if (fisico) {
      const buffer = fs.readFileSync(fisico);
      caminhoAssinado = arquivoAssinadoUrl!;
      hash = createHash('sha256').update(buffer).digest('hex');
      paginas = await contarPaginasPdf(buffer).catch(() => paginas);
    }

    await this.ds.transaction(async (m) => {
      await m.getRepository(DocumentoFaseInterna).update(doc.id, {
        status: StatusDocumento.ASSINADO,
        totalmente_assinado: true,
        data_documento: dataDocumento,
        caminho_arquivo: caminhoAssinado,
        hash_arquivo: hash,
        assinaturas: sigs.map((s) => {
          const e = exigidos.find((x) => x.email && s.email && String(x.email).toLowerCase() === String(s.email).toLowerCase());
          return {
            assinante_id: e?.usuario_id ?? '',
            assinante_nome: s.nome,
            assinante_cargo: s.papel ?? e?.papel ?? undefined,
            cpf: s.cpf_cnpj || undefined,
            tipo: 'INTERNA' as const,
            data_assinatura: new Date(s.data_assinatura).toISOString(),
            hash_documento: docAss?.documento_hash ?? hash ?? '',
          };
        }),
      });
      await atribuirFolhas(m, doc.licitacao_id, doc.id, paginas);
    });
    this.logger.log(`Peça ${doc.tipo} v${doc.versao} do processo ${doc.licitacao_id} ASSINADA por ${sigs.length} signatário(s)`);
  }
}
