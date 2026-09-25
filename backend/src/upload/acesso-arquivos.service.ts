import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Ator, ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import {
  CaminhoLogico,
  TIPOS_REGISTRO_FORNECEDOR,
  resolverArquivo,
  tipoPublico,
  verificarAssinatura,
} from '../common/arquivos/arquivos';
import { licitacaoEhPublica } from '../licitacoes/licitacao-visao.util';

/**
 * Quem é DONO de um arquivo sensível (descoberto pelos registros que o
 * referenciam). `orgaoIds` = órgãos do registro (contrato, medição, licitação,
 * nota fiscal...); `fornecedorIds` = fornecedor do registro.
 */
export interface DonosArquivo {
  /** Pode sair sem login (documento PUBLICADO de licitação pública). */
  publico: boolean;
  /** Documento do registro cadastral do fornecedor (órgão só com vínculo). */
  registroFornecedor: boolean;
  orgaoIds: string[];
  fornecedorIds: string[];
}

export type DecisaoAcesso = 'PERMITIDO' | 'SEM_LOGIN' | 'NEGADO';

/**
 * Regra de acesso (pura — testada em unidade):
 *  - público → todos;
 *  - sem login → 401;
 *  - ADMIN da plataforma → sim;
 *  - fornecedor → só se for o fornecedor dono;
 *  - órgão → se for órgão do registro; se o arquivo é SÓ do fornecedor (registro
 *    cadastral / envio do fornecedor sem órgão) → com vínculo (proposta/contrato);
 *    arquivo LEGADO sem dono identificável (e que não é do registro cadastral)
 *    → sim (compatibilidade: antes era público);
 *  - demais → não.
 */
export function decidirAcesso(ator: Ator | null | undefined, d: DonosArquivo, vinculoOrgaoFornecedor = false): DecisaoAcesso {
  if (d.publico) return 'PERMITIDO';
  if (!ator) return 'SEM_LOGIN';
  if (ator.admin) return 'PERMITIDO';
  if (ehFornecedor(ator)) return d.fornecedorIds.includes(ator.fornecedorId) ? 'PERMITIDO' : 'NEGADO';
  if (ehOrgao(ator)) {
    if (d.orgaoIds.includes(ator.orgaoId)) return 'PERMITIDO';
    if (d.orgaoIds.length === 0 && d.fornecedorIds.length > 0) return vinculoOrgaoFornecedor ? 'PERMITIDO' : 'NEGADO';
    const semDono = d.orgaoIds.length === 0 && d.fornecedorIds.length === 0;
    if (semDono && !d.registroFornecedor) return 'PERMITIDO';
    return 'NEGADO';
  }
  return 'NEGADO';
}

export interface PedidoArquivo {
  ator: Ator | null;
  expira?: string | null;
  assinatura?: string | null;
}

const RE_BOLETIM = /^boletim_([0-9a-f-]{36})\.pdf$/i;

@Injectable()
export class AcessoArquivosService {
  private readonly logger = new Logger(AcessoArquivosService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /**
   * Autoriza e devolve o caminho FÍSICO do arquivo. Lança 401 (sem login),
   * 404 (sem permissão — não revela a existência — ou inexistente).
   */
  async autorizarLeitura(c: CaminhoLogico | null, pedido: PedidoArquivo): Promise<string> {
    if (!c) throw new NotFoundException('Arquivo não encontrado');
    if (!tipoPublico(c.tipo) && !verificarAssinatura(c.rel, pedido.expira, pedido.assinatura)) {
      const donos = await this.donos(c);
      let vinculo = false;
      if (ehOrgao(pedido.ator) && !pedido.ator.admin && donos.orgaoIds.length === 0 && donos.fornecedorIds.length > 0) {
        for (const f of donos.fornecedorIds) {
          if (await this.acesso.orgaoTemVinculoComFornecedor(pedido.ator.orgaoId, f)) {
            vinculo = true;
            break;
          }
        }
      }
      const decisao = decidirAcesso(pedido.ator, donos, vinculo);
      if (decisao === 'SEM_LOGIN') throw new UnauthorizedException('Autenticação necessária');
      if (decisao === 'NEGADO') throw new NotFoundException('Arquivo não encontrado');
    }
    const fisico = resolverArquivo(c);
    if (!fisico) throw new NotFoundException('Arquivo não encontrado');
    return fisico;
  }

  /** Donos do arquivo a partir do registro de upload e dos registros que o referenciam. */
  async donos(c: CaminhoLogico): Promise<DonosArquivo> {
    const d: DonosArquivo = {
      publico: false,
      registroFornecedor: TIPOS_REGISTRO_FORNECEDOR.includes(c.tipo),
      orgaoIds: [],
      fornecedorIds: [],
    };
    const addOrgao = (id: any) => id && !d.orgaoIds.includes(String(id)) && d.orgaoIds.push(String(id));
    const addForn = (id: any) => id && !d.fornecedorIds.includes(String(id)) && d.fornecedorIds.push(String(id));
    const q = async (sql: string, params: unknown[]): Promise<any[]> => {
      try {
        return await this.dataSource.query(sql, params);
      } catch (e: any) {
        // tabela ausente em ambiente parcial não pode virar 500 nem liberar acesso
        this.logger.warn(`Consulta de dono do arquivo falhou: ${e?.message ?? e}`);
        return [];
      }
    };

    // 1. Registro do upload (AUTORITATIVO: encerra a busca)
    const up = await q(`SELECT orgao_id, fornecedor_id FROM arquivos_upload WHERE caminho = $1`, [c.rel]);
    if (up.length) {
      addOrgao(up[0].orgao_id);
      addForn(up[0].fornecedor_id);
      return d;
    }

    const sufixo = `/${c.rel}`;

    // 2. Registro cadastral do fornecedor (o registro mais antigo que cita o arquivo)
    const fd = await q(
      `SELECT fornecedor_id FROM fornecedor_documentos
        WHERE caminho_arquivo IS NOT NULL AND right(split_part(caminho_arquivo, '?', 1), $2) = $1
        ORDER BY created_at ASC LIMIT 1`,
      [sufixo, sufixo.length],
    );
    if (fd.length) {
      d.registroFornecedor = true;
      addForn(fd[0].fornecedor_id);
      return d;
    }

    // 3. Documento de licitação (pasta documentos/licitacoes/licitacao)
    if (['documentos', 'licitacoes', 'licitacao'].includes(c.tipo)) {
      const dl = await q(
        `SELECT d.publico, d.status::text AS status, l.orgao_id, l.fase::text AS fase, l.data_publicacao_edital
           FROM documentos_licitacao d JOIN licitacoes l ON l.id = d.licitacao_id
          WHERE d.nome_arquivo = $1`,
        [c.nome],
      );
      for (const r of dl) {
        addOrgao(r.orgao_id);
        if (r.publico && r.status === 'PUBLICADO' && licitacaoEhPublica({ fase: r.fase, data_publicacao_edital: r.data_publicacao_edital })) {
          d.publico = true;
        }
      }
      if (dl.length) d.registroFornecedor = false;
    }

    // 4. Subpasta = id do registro
    const sub = c.subpastas[0];
    if (ehUuid(sub)) {
      if (c.tipo === 'medicoes' || c.tipo === 'medicao-chat') await this.donosDaMedicao(sub, q, addOrgao, addForn);
      else if (c.tipo === 'contratos') {
        const r = await q(`SELECT orgao_id, fornecedor_id FROM contratos WHERE id = $1`, [sub]);
        r.forEach((x) => (addOrgao(x.orgao_id), addForn(x.fornecedor_id)));
      } else if (c.tipo === 'atas') {
        // Termo da ARP (E6): órgão gerenciador e fornecedor da ata
        const r = await q(`SELECT orgao_id, fornecedor_id FROM atas_registro_preco WHERE id = $1`, [sub]);
        r.forEach((x) => (addOrgao(x.orgao_id), addForn(x.fornecedor_id)));
      } else if (c.tipo === 'resultados') {
        // Termo de adjudicação/homologação (E6 — formalização): órgão da
        // licitação; ato público depois da homologação (só o termo efetivado)
        const r = await q(`SELECT orgao_id, data_homologacao FROM licitacoes WHERE id = $1`, [sub]);
        r.forEach((x) => addOrgao(x.orgao_id));
        if (r[0]?.data_homologacao) {
          const f = await q(
            `SELECT 1 FROM formalizacoes_resultado
              WHERE licitacao_id = $1 AND status = 'EFETIVADO' AND ($2 IN (arquivo_termo, arquivo_assinado)) LIMIT 1`,
            [sub, c.rel],
          );
          if (f.length) d.publico = true;
        }
      } else if (c.tipo === 'licitacoes') {
        const r = await q(`SELECT orgao_id FROM licitacoes WHERE id = $1`, [sub]);
        r.forEach((x) => addOrgao(x.orgao_id));
      }
    }

    // 5. Boletim da medição
    const bol = c.tipo === 'boletins' ? c.nome.match(RE_BOLETIM) : null;
    if (bol) await this.donosDaMedicao(bol[1], q, addOrgao, addForn);

    // 6. Nota fiscal do fornecedor (caminho completo gravado em disco)
    if (c.tipo === 'notas-fiscais') {
      const r = await q(
        `SELECT orgao_id, fornecedor_id FROM notas_fiscais_fornecedor
          WHERE right(replace(coalesce(caminho_pdf, ''), '\\', '/'), $2) = $1
             OR right(replace(coalesce(caminho_xml, ''), '\\', '/'), $2) = $1
             OR strpos(documentos_extras::text, $3) > 0
          LIMIT 5`,
        [sufixo, sufixo.length, c.nome],
      );
      r.forEach((x) => (addOrgao(x.orgao_id), addForn(x.fornecedor_id)));
    }

    return d;
  }

  private async donosDaMedicao(
    medicaoId: string,
    q: (sql: string, p: unknown[]) => Promise<any[]>,
    addOrgao: (id: any) => void,
    addForn: (id: any) => void,
  ): Promise<void> {
    const r = await q(
      `SELECT c.orgao_id, c.fornecedor_id FROM medicoes m JOIN contratos c ON c.id = m.contrato_id WHERE m.id = $1`,
      [medicaoId],
    );
    r.forEach((x) => (addOrgao(x.orgao_id), addForn(x.fornecedor_id)));
  }

  /** Registra o dono de um arquivo recém-enviado pelo upload genérico. */
  async registrarUpload(dados: {
    caminho: string;
    tipo: string;
    privado: boolean;
    nomeOriginal?: string | null;
    ator: Ator | null;
  }): Promise<void> {
    const a = dados.ator;
    await this.dataSource.query(
      `INSERT INTO arquivos_upload (caminho, tipo, privado, nome_original, enviado_por_tipo, enviado_por_id, orgao_id, fornecedor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (caminho) DO NOTHING`,
      [
        dados.caminho,
        dados.tipo,
        dados.privado,
        dados.nomeOriginal ? String(dados.nomeOriginal).slice(0, 255) : null,
        a?.tipo ?? null,
        a?.id ? String(a.id).slice(0, 64) : null,
        ehUuid(a?.orgaoId) ? a!.orgaoId : null,
        ehUuid(a?.fornecedorId) ? a!.fornecedorId : null,
      ],
    );
  }
}
