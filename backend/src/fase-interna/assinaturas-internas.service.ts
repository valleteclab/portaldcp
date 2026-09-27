import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { caminhoContido, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { PortalAssinaturasService } from '../portal-assinaturas/portal-assinaturas.service';
import { TITULO_DOCUMENTO } from './documentos-obrigatorios';
import { PREFIXO_TAREFA_ASSINATURA, PecasFaseInternaService, chaveTarefaAssinatura } from './pecas-fase-interna.service';
import { TELA_DO_PASSO } from './fluxo/catalogo-fluxo';
import { passoDaPeca } from './tarefas/etapas-fase-interna';
import { ResultadoSincronizacao, TarefasService } from './tarefas/tarefas.service';

/** Item da aba "Assinaturas" da Central de Aprovações. */
export interface AssinaturaPendente {
  /** Documento do portal de assinaturas (a chave das ações). */
  documento_assinatura_id: string;
  origem: 'FASE_INTERNA' | 'CONTRATO' | 'OUTRO';
  titulo: string;
  papel: string | null;
  enviado_em: string | null;
  /** Quem mais assina e quem já assinou (transparência: a peça só vale com todas). */
  signatarios: Array<{ nome: string; papel: string | null; assinou: boolean; sou_eu: boolean }>;
  processo: { id: string; numero_processo: string | null; objeto: string | null } | null;
  peca: { documento_id: string; tipo: string; titulo: string; versao: number; tela: string | null } | null;
  /** Rota do PDF que vai ser assinado. */
  pdf_url: string;
  /** Onde a peça é vista no processo. */
  link: string | null;
}

const SITUACOES_VIVAS_PECA = 'AGUARDANDO_ASSINATURA';

/**
 * ASSINATURAS INTERNAS (homologação multiusuário, E1): a peça "Aguardando
 * assinaturas" não tinha onde ser assinada — o signatário interno só recebia
 * um e-mail apontando para o portal. Aqui:
 *  - `pendentes(ator)`: tudo o que o USUÁRIO DO JWT precisa assinar no órgão
 *    dele (peças da fase interna — TR, despacho de autorização, parecer… —,
 *    contratos e outros documentos do portal em que ele é signatário interno);
 *  - `assinar(ator, documentoAssinaturaId)`: mesmo mecanismo do "Autorizar e
 *    assinar" (portal de assinaturas; o signatário é o próprio usuário logado,
 *    sem código). Só o signatário assina (403); documento de outro órgão → 404;
 *  - `reconciliar` (depois de cada sincronização do processo): a tarefa
 *    "Assinar <peça>" que sobrou (versão nova, devolução, pedido cancelado,
 *    assinatura pelo link do portal) é cancelada ou concluída.
 * Isolamento: órgão e usuário SEMPRE do JWT.
 */
@Injectable()
export class AssinaturasInternasService {
  private readonly logger = new Logger(AssinaturasInternasService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly pecas: PecasFaseInternaService,
    private readonly portal: PortalAssinaturasService,
    private readonly tarefas: TarefasService,
  ) {
    tarefas.registrarDepoisDeSincronizar((r) => this.reconciliar(r));
  }

  /** Usuário do órgão (e-mail e CPF do cadastro — a assinatura é pessoal). */
  private async usuario(ator: Ator): Promise<{ id: string; nome: string; email: string | null; cpf: string | null } | null> {
    if (ator.tipo !== 'USUARIO' || !ator.usuarioId || !ator.orgaoId) return null;
    const [u] = await this.ds.query(
      `SELECT id::text AS id, nome, email, cpf FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
      [ator.usuarioId, ator.orgaoId],
    );
    return u ?? null;
  }

  // ==========================================================================
  // LISTA (Central de Aprovações › Assinaturas)
  // ==========================================================================

  async pendentes(ator: Ator): Promise<{ itens: AssinaturaPendente[]; aviso: string | null }> {
    const u = await this.usuario(ator);
    if (!u) {
      return {
        itens: [],
        aviso: 'A assinatura é pessoal: entre com o seu usuário (não com o login do órgão) para ver e assinar o que foi enviado para você.',
      };
    }
    const orgaoId = ator.orgaoId as string;
    const itens: AssinaturaPendente[] = [];

    // 1) Peças da fase interna (versão atual, aguardando) em que ele é signatário designado
    const pecas: any[] = await this.ds.query(
      `SELECT d.id::text AS id, d.licitacao_id::text AS licitacao_id, d.tipo::text AS tipo, d.titulo, d.versao,
              d.documento_assinatura_id::text AS documento_assinatura_id, d.signatarios_exigidos,
              l.numero_processo, l.objeto, da.created_at AS enviado_em
         FROM documentos_fase_interna d
         JOIN licitacoes l ON l.id = d.licitacao_id
         JOIN documentos_assinatura da ON da.id = d.documento_assinatura_id
        WHERE l.orgao_id::text = $1 AND d.versao_atual = true AND d.status::text = $2
          AND da.status::text = 'AGUARDANDO_ASSINATURAS'
          AND COALESCE(d.signatarios_exigidos, '[]'::jsonb) @> $3::jsonb
        ORDER BY da.created_at`,
      [orgaoId, SITUACOES_VIVAS_PECA, JSON.stringify([{ usuario_id: u.id }])],
    );
    const idsDaFaseInterna = new Set<string>();
    for (const p of pecas) {
      idsDaFaseInterna.add(p.documento_assinatura_id);
      const sigs = await this.signatariosDoDocumento(p.documento_assinatura_id);
      const exigido = (p.signatarios_exigidos ?? []).find((x: any) => x.usuario_id === u.id);
      const email = String(exigido?.email ?? u.email ?? '').toLowerCase();
      const meu = sigs.find((s) => String(s.email ?? '').toLowerCase() === email);
      if (!meu || meu.status === 'ASSINADO') continue;
      const passo = passoDaPeca(p.tipo, true) ?? passoDaPeca(p.tipo, false);
      const tela = passo ? TELA_DO_PASSO[passo] ?? null : null;
      itens.push({
        documento_assinatura_id: p.documento_assinatura_id,
        origem: 'FASE_INTERNA',
        titulo: `${p.titulo || TITULO_DOCUMENTO[p.tipo as keyof typeof TITULO_DOCUMENTO] || p.tipo} — versão ${p.versao}`,
        papel: exigido?.papel ?? meu.papel ?? null,
        enviado_em: p.enviado_em ? new Date(p.enviado_em).toISOString() : null,
        signatarios: sigs.map((s) => ({ nome: s.nome, papel: s.papel ?? null, assinou: s.status === 'ASSINADO', sou_eu: s === meu })),
        processo: { id: p.licitacao_id, numero_processo: p.numero_processo ?? null, objeto: p.objeto ?? null },
        peca: { documento_id: p.id, tipo: p.tipo, titulo: TITULO_DOCUMENTO[p.tipo as keyof typeof TITULO_DOCUMENTO] ?? p.tipo, versao: p.versao, tela },
        pdf_url: `/api/fase-interna/documento/${p.id}/arquivo`,
        link: tela ? `/orgao/processos/${p.licitacao_id}/fase-interna/${tela}` : `/orgao/processos/${p.licitacao_id}#peca-${p.tipo}`,
      });
    }

    // 2) Demais documentos do portal (contratos, termos…) em que ele é signatário INTERNO
    if (u.email) {
      const outros: any[] = await this.ds.query(
        `SELECT da.id::text AS id, da.titulo, da.created_at, s.papel, c.id::text AS contrato_id, c.numero_contrato
           FROM signatarios_documento s
           JOIN documentos_assinatura da ON da.id = s.documento_id
           LEFT JOIN contratos c ON c.documento_assinatura_id = da.id
          WHERE da.orgao_id::text = $1 AND s.is_orgao_user = true AND lower(s.email) = lower($2)
            AND s.status::text = 'PENDENTE' AND da.status::text = 'AGUARDANDO_ASSINATURAS'
          ORDER BY da.created_at`,
        [orgaoId, u.email],
      );
      for (const d of outros) {
        if (idsDaFaseInterna.has(d.id)) continue;
        // Peça da fase interna substituída/devolvida (pedido órfão): não aparece
        const [peca] = await this.ds.query(`SELECT 1 FROM documentos_fase_interna WHERE documento_assinatura_id::text = $1 LIMIT 1`, [d.id]);
        if (peca) continue;
        const sigs = await this.signatariosDoDocumento(d.id);
        itens.push({
          documento_assinatura_id: d.id,
          origem: d.contrato_id ? 'CONTRATO' : 'OUTRO',
          titulo: d.titulo || (d.numero_contrato ? `Contrato ${d.numero_contrato}` : 'Documento'),
          papel: d.papel ?? null,
          enviado_em: d.created_at ? new Date(d.created_at).toISOString() : null,
          signatarios: sigs.map((s) => ({
            nome: s.nome,
            papel: s.papel ?? null,
            assinou: s.status === 'ASSINADO',
            sou_eu: String(s.email ?? '').toLowerCase() === String(u.email).toLowerCase(),
          })),
          processo: null,
          peca: null,
          pdf_url: `/api/assinaturas-internas/${d.id}/arquivo`,
          link: d.contrato_id ? `/orgao/contratos/${d.contrato_id}` : '/orgao/portal-assinaturas',
        });
      }
    }
    return { itens, aviso: null };
  }

  private async signatariosDoDocumento(documentoAssinaturaId: string): Promise<Array<{ id: string; nome: string; email: string | null; papel: string | null; status: string }>> {
    return this.ds.query(
      `SELECT id::text AS id, nome, email, papel, status::text AS status FROM signatarios_documento WHERE documento_id::text = $1 ORDER BY created_at, nome`,
      [documentoAssinaturaId],
    );
  }

  /** Documento do portal do órgão do ator (outro órgão ou inexistente → 404). */
  private async documentoDoOrgao(documentoAssinaturaId: string, ator: Ator) {
    const [d] = ehUuid(documentoAssinaturaId)
      ? await this.ds.query(
          `SELECT id::text AS id, orgao_id::text AS orgao_id, status::text AS status, titulo, arquivo_original_url, arquivo_assinado_url
             FROM documentos_assinatura WHERE id::text = $1`,
          [documentoAssinaturaId],
        )
      : [];
    if (!d || (!ator.admin && d.orgao_id !== ator.orgaoId)) throw new NotFoundException('Documento não encontrado');
    return d as { id: string; orgao_id: string; status: string; titulo: string; arquivo_original_url: string; arquivo_assinado_url: string | null };
  }

  // ==========================================================================
  // ASSINAR
  // ==========================================================================

  async assinar(documentoAssinaturaId: string, ator: Ator, rede: { ip?: string; userAgent?: string } = {}) {
    const d = await this.documentoDoOrgao(documentoAssinaturaId, ator);
    const u = await this.usuario(ator);
    if (!u) throw new ForbiddenException('A assinatura é pessoal: entre com o seu usuário para assinar.');
    // Peça da fase interna: o mesmo caminho do "Autorizar e assinar" (confere o signatário designado)
    const [peca] = await this.ds.query(
      `SELECT licitacao_id::text AS licitacao_id, tipo::text AS tipo, versao_atual, status::text AS status FROM documentos_fase_interna
        WHERE documento_assinatura_id::text = $1 ORDER BY versao DESC LIMIT 1`,
      [d.id],
    );
    if (peca) {
      if (!peca.versao_atual || peca.status !== SITUACOES_VIVAS_PECA) {
        throw new ConflictException('Esta versão da peça não aguarda mais assinatura (foi substituída, devolvida ou já assinada).');
      }
      const r = await this.pecas.assinarComoSignatario(peca.licitacao_id, peca.tipo, ator, rede);
      return { documento_assinatura_id: d.id, concluida: r.concluida, status: r.documento.status, peca: { documento_id: r.documento.id, tipo: r.documento.tipo, versao: r.documento.versao } };
    }
    // Demais documentos do portal: só quem é signatário interno com o e-mail do cadastro
    if (d.status !== 'AGUARDANDO_ASSINATURAS') throw new ConflictException('O documento não está aguardando assinaturas.');
    const sigs = await this.signatariosDoDocumento(d.id);
    const [meu] = u.email
      ? await this.ds.query(
          `SELECT id::text AS id, status::text AS status FROM signatarios_documento
            WHERE documento_id::text = $1 AND is_orgao_user = true AND lower(email) = lower($2) LIMIT 1`,
          [d.id, u.email],
        )
      : [];
    if (!meu) throw new ForbiddenException(sigs.length ? 'Você não é signatário deste documento.' : 'O documento não tem signatários.');
    if (meu.status === 'ASSINADO') throw new ConflictException('Você já assinou este documento.');
    const r = await this.portal.assinarComoOrgaoUser(d.id, meu.id, { email: u.email, cpf: u.cpf }, rede.ip || '', rede.userAgent || '');
    return { documento_assinatura_id: d.id, concluida: !!r?.pdf_url, status: r?.pdf_url ? 'CONCLUIDO' : 'AGUARDANDO_ASSINATURAS', peca: null };
  }

  /** PDF a assinar (documento do portal do órgão do ator; outro órgão → 404). */
  async arquivo(documentoAssinaturaId: string, ator: Ator): Promise<{ caminho: string; nome: string }> {
    const d = await this.documentoDoOrgao(documentoAssinaturaId, ator);
    const ref = d.arquivo_assinado_url || d.arquivo_original_url;
    const base = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    // Pasta sensível (privada) primeiro; legado (UPLOAD_DIR) depois — sempre contido na base
    const caminho = (ref ? resolverArquivoDeUrl(ref) : null) ?? (ref ? caminhoContido(base, ref) : null);
    if (!caminho || !fs.existsSync(caminho)) {
      throw new NotFoundException('Arquivo do documento não encontrado');
    }
    return { caminho, nome: `${String(d.titulo || 'documento').replace(/[^\w.\-() ]+/g, '_').slice(0, 80)}.pdf` };
  }

  // ==========================================================================
  // RECONCILIAÇÃO DAS TAREFAS "ASSINAR <PEÇA>" (depois da sincronização)
  // ==========================================================================

  async reconciliar(r: ResultadoSincronizacao): Promise<void> {
    const abertas: Array<{ chave: string; origem_id: string | null; responsavel_usuario_id: string | null }> = await this.ds.query(
      `SELECT chave, origem_id, responsavel_usuario_id::text AS responsavel_usuario_id FROM tarefas
        WHERE licitacao_id::text = $1 AND status = 'ABERTA' AND origem = 'ASSINATURA' AND chave LIKE $2`,
      [r.lic.id, `${PREFIXO_TAREFA_ASSINATURA}%`],
    );
    for (const t of abertas) {
      try {
        const [doc] = t.origem_id && ehUuid(t.origem_id)
          ? await this.ds.query(
              `SELECT d.versao_atual, d.status::text AS status, d.documento_assinatura_id::text AS doc_ass, d.signatarios_exigidos
                 FROM documentos_fase_interna d WHERE d.id::text = $1`,
              [t.origem_id],
            )
          : [];
        const exigido = (doc?.signatarios_exigidos ?? []).find((x: any) => x.usuario_id === t.responsavel_usuario_id);
        const [sig] = doc?.doc_ass && exigido?.email
          ? await this.ds.query(
              `SELECT nome, status::text AS status FROM signatarios_documento WHERE documento_id::text = $1 AND lower(email) = lower($2) LIMIT 1`,
              [doc.doc_ass, exigido.email],
            )
          : [];
        if (sig?.status === 'ASSINADO') {
          // Assinou por outro caminho (link do portal): a tarefa conclui em nome dele
          await this.tarefas.concluirTarefaPorChave(r.lic.id, t.chave, { id: t.responsavel_usuario_id, nome: sig.nome ?? null });
        } else if (!doc || !doc.versao_atual || doc.status !== SITUACOES_VIVAS_PECA) {
          await this.tarefas.cancelarTarefaPorChave(r.lic.id, t.chave, 'A peça não aguarda mais esta assinatura (versão nova, devolução ou pedido cancelado).');
        }
      } catch (e: any) {
        this.logger.warn(`Tarefa de assinatura ${t.chave} não reconciliada: ${e?.message ?? e}`);
      }
    }
  }

  /** Chave da tarefa do signatário (exposta para os testes e a tela). */
  static chave(documentoId: string, usuarioId: string) {
    return chaveTarefaAssinatura(documentoId, usuarioId);
  }
}
