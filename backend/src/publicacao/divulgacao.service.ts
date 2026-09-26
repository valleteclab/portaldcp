import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import { DataSource } from 'typeorm';
import { resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { FaseLicitacao, ModalidadeLicitacao } from '../licitacoes/entities/licitacao.entity';
import { confirmarDivulgacaoOficial } from '../licitacoes/transicoes/divulgacao';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { avisoContratacaoVigenteSql, gerarAvisoContratacaoSql, versoesAvisoSql } from './aviso-contratacao';

/** Linha da COMPRA na fila do PNCP, com o retorno real da API. */
export interface CompraNaFila {
  id: string;
  status: string;
  tentativas: number;
  max_tentativas: number;
  ultima_tentativa: Date | null;
  proximo_envio: Date | null;
  enviado_em: Date | null;
  numero_controle_pncp: string | null;
  erro_mensagem: string | null;
  erro_status_http: number | null;
  erro_resposta: unknown;
}

/**
 * DIVULGAÇÃO OFICIAL do processo (Lei 14.133 arts. 54, 174 e 176; art. 75
 * §3º; IN SEGES 67/2021 arts. 6º e 7º): situação para o cockpit (aguardando
 * PNCP, erro real da API, o que corrigir), aviso de contratação direta
 * guardado (gerar prévia, versões, arquivo) e o registro da publicação no
 * diário oficial para órgão SEM integração com o PNCP (art. 176 par. único).
 */
@Injectable()
export class DivulgacaoService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly transicoes: TransicoesService,
  ) {}

  private async lic(id: string) {
    const [l] = await this.ds.query(
      `SELECT l.id::text AS id, l.fase::text AS fase, l.situacao::text AS situacao, l.modalidade::text AS modalidade, l.selecao_externa,
              l.numero_processo, l.data_publicacao_edital, l.data_divulgacao_oficial, l.meio_divulgacao_oficial,
              l.referencia_divulgacao_oficial, l.data_inicio_acolhimento, l.data_fim_acolhimento, l.data_abertura_sessao,
              (COALESCE(o.pncp_vinculado, false) OR NULLIF(o.pncp_codigo_unidade::text, '') IS NOT NULL OR NULLIF(l.codigo_unidade_compradora::text, '') IS NOT NULL) AS integrado
         FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id::text = $1`,
      [id],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    return l;
  }

  // ---------------------------------------------------------------------------
  // Situação da divulgação (banner do cockpit)
  // ---------------------------------------------------------------------------

  async situacao(id: string) {
    const l = await this.lic(id);
    const [compra]: CompraNaFila[] = await this.ds.query(
      `SELECT id::text AS id, status::text AS status, tentativas, max_tentativas, ultima_tentativa, proximo_envio, enviado_em,
              numero_controle_pncp, erro_mensagem, erro_status_http, erro_resposta
         FROM pncp_sync WHERE licitacao_id::text = $1 AND tipo::text = 'COMPRA' AND status::text <> 'EXCLUIDO'
        ORDER BY (chave_idempotencia IS NOT NULL) DESC, created_at DESC LIMIT 1`,
      [id],
    );
    const aguardando = l.fase === FaseLicitacao.AGUARDANDO_DIVULGACAO;
    const interna = ehFaseInterna(l.fase);
    const estado = interna ? 'NAO_PUBLICADO' : aguardando ? 'AGUARDANDO' : l.selecao_externa ? 'EXTERNA' : 'CONFIRMADA';
    const erro = aguardando && compra && ['ERRO', 'ERRO_TEMPORARIO', 'ERRO_DEFINITIVO'].includes(compra.status);
    return {
      estado,
      aguardando_divulgacao: aguardando,
      integrado_pncp: !!l.integrado,
      data_ato_publicacao: l.data_publicacao_edital,
      data_divulgacao_oficial: l.data_divulgacao_oficial,
      meio_divulgacao_oficial: l.meio_divulgacao_oficial,
      referencia_divulgacao_oficial: l.referencia_divulgacao_oficial,
      compra: compra ?? null,
      banner: aguardando
        ? {
            tipo: erro ? 'ERRO' : 'AGUARDANDO',
            titulo: erro ? 'Aviso NÃO publicado no PNCP — prazo não iniciado' : 'Aguardando a publicação no PNCP — prazo não iniciado',
            mensagem: !l.integrado
              ? 'Órgão sem integração com o PNCP: registre a publicação oficial (diário oficial — art. 176, parágrafo único, da Lei 14.133/2021) para abrir o prazo.'
              : erro
                ? `O PNCP recusou/não recebeu a compra${compra?.erro_status_http ? ` (HTTP ${compra.erro_status_http})` : ''}: ${compra?.erro_mensagem ?? 'sem mensagem'}`
                : compra?.status === 'PENDENTE' && compra?.erro_mensagem
                  ? compra.erro_mensagem
                  : 'O envio ao PNCP está na fila; o prazo de propostas começa quando o PNCP devolver o número de controle da compra.',
            pendencias: this.oQueCorrigir(compra),
            pode_reenviar: !!compra && compra.status !== 'ENVIADO' && compra.status !== 'ENVIANDO',
            reenviar_id: compra?.id ?? null,
            pode_registrar_diario_oficial: !l.integrado,
          }
        : null,
    };
  }

  /** Pistas do que corrigir a partir da mensagem real do PNCP (a tela leva ao cartão certo). */
  private oQueCorrigir(compra: CompraNaFila | undefined): Array<{ campo: string; texto: string }> {
    if (!compra?.erro_mensagem || !['ERRO', 'ERRO_TEMPORARIO', 'ERRO_DEFINITIVO'].includes(compra.status)) return [];
    const m = compra.erro_mensagem;
    const p: Array<{ campo: string; texto: string }> = [];
    if (/item/i.test(m)) p.push({ campo: 'itens', texto: 'Itens da contratação (quantidade, valor estimado, unidade, material/serviço)' });
    if (/cnpj|unidade|orgao|órgão/i.test(m)) p.push({ campo: 'orgao', texto: 'Cadastro do órgão no PNCP (CNPJ / unidade compradora)' });
    if (/data|prazo|abertura|encerramento/i.test(m)) p.push({ campo: 'cronograma', texto: 'Datas do aviso (recebimento de propostas)' });
    if (/documento|arquivo|edital|aviso/i.test(m)) p.push({ campo: 'documento', texto: 'Aviso/edital (arquivo PDF)' });
    if (compra.status === 'ERRO_TEMPORARIO' || (compra.erro_status_http ?? 0) >= 500 || !compra.erro_status_http) {
      p.push({ campo: 'reenvio', texto: 'Falha temporária do PNCP ou da rede: o reenvio é automático (ou use "Reenviar agora")' });
    }
    if (!p.length) p.push({ campo: 'dados', texto: 'Confira os dados do processo apontados na mensagem do PNCP; para alterar o que já foi publicado, cancele a publicação, corrija e publique de novo' });
    return p;
  }

  // ---------------------------------------------------------------------------
  // Aviso de contratação direta
  // ---------------------------------------------------------------------------

  async gerarAviso(id: string, cronograma: Record<string, any> | undefined, autor: { id?: string | null; nome?: string | null }) {
    const l = await this.lic(id);
    if (l.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) {
      throw new BadRequestException('O aviso de contratação direta é o documento da dispensa eletrônica (art. 75, §3º).');
    }
    if (!ehFaseInterna(l.fase)) {
      throw new ConflictException('Aviso já divulgado — a versão publicada é a do processo (alterações: retificação ou cancelamento da publicação).');
    }
    const campos = ['data_publicacao_edital', 'data_limite_impugnacao', 'data_inicio_acolhimento', 'data_fim_acolhimento', 'data_abertura_sessao'];
    const c: Record<string, any> = {};
    for (const k of campos) {
      const v = cronograma?.[k];
      if (!v) continue;
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new BadRequestException(`Data inválida: ${k}`);
      c[k] = d;
    }
    const meta = await this.ds.transaction((m) => gerarAvisoContratacaoSql(m, id, { cronograma: c, autor, motivo: 'Prévia gerada antes da divulgação' }));
    return { documento_id: meta.documento_id, versao: meta.versao, status: meta.status, hash: meta.hash, nome: meta.nome_original };
  }

  async avisos(id: string, dono: boolean) {
    const versoes = await versoesAvisoSql(this.ds.manager, id);
    const vigente = await avisoContratacaoVigenteSql(this.ds.manager, id);
    const visiveis = dono ? versoes : versoes.filter((v: any) => v.status === 'PUBLICADO' || v.status === 'SUBSTITUIDO' && !!v.data_publicacao);
    return {
      vigente: vigente && (dono || vigente.status === 'PUBLICADO')
        ? { documento_id: vigente.documento_id, versao: vigente.versao, status: vigente.status, hash: vigente.hash, nome: vigente.nome_original }
        : null,
      versoes: visiveis,
    };
  }

  async arquivoAviso(id: string, documentoId: string, dono: boolean): Promise<{ bytes: Buffer; nome: string }> {
    const [d] = await this.ds.query(
      `SELECT caminho_arquivo, nome_original, status::text AS status, data_publicacao FROM documentos_licitacao
        WHERE id::text = $1 AND licitacao_id::text = $2 AND tipo::text = 'AVISO_LICITACAO'`,
      [documentoId, id],
    );
    if (!d || (!dono && !d.data_publicacao)) throw new NotFoundException('Versão do aviso não encontrada');
    const candidatos = [d.caminho_arquivo, resolverArquivoDeUrl(d.caminho_arquivo)].filter(Boolean) as string[];
    const caminho = candidatos.find((c) => existsSync(c));
    if (!caminho) throw new NotFoundException('Arquivo do aviso não encontrado no servidor');
    return { bytes: readFileSync(caminho), nome: d.nome_original || 'aviso-contratacao-direta.pdf' };
  }

  // ---------------------------------------------------------------------------
  // Diário oficial (órgão sem PNCP — art. 176 par. único)
  // ---------------------------------------------------------------------------

  /**
   * Municípios que ainda não adotaram o PNCP publicam em diário oficial (art.
   * 176 par. único, I). O órgão registra a data e a referência (edição,
   * página, link); é a divulgação oficial daquele processo — os prazos correm
   * dela. Órgão integrado ao PNCP: a confirmação vem da fila (ou de "vincular
   * compra existente"), nunca deste registro.
   */
  async registrarDiarioOficial(id: string, dto: { data_divulgacao?: string; referencia?: string }, ator: AtorTransicao) {
    const l = await this.lic(id);
    if (l.fase !== FaseLicitacao.AGUARDANDO_DIVULGACAO) {
      throw new ConflictException('Só se registra a divulgação oficial de licitação publicada e ainda aguardando a divulgação.');
    }
    if (l.integrado) {
      throw new ConflictException(
        'Órgão integrado ao PNCP: a divulgação é confirmada automaticamente quando o PNCP devolve o número da compra (arts. 54 e 174). Corrija e reenvie pela fila, ou vincule a compra já publicada no PNCP.',
      );
    }
    const referencia = String(dto?.referencia || '').trim();
    if (referencia.length < 5) throw new BadRequestException('Informe a referência da publicação (diário oficial: edição, página ou link) — mínimo 5 caracteres.');
    const data = dto?.data_divulgacao ? new Date(dto.data_divulgacao) : null;
    if (!data || isNaN(data.getTime())) throw new BadRequestException('Informe a data da publicação no diário oficial.');
    if (data.getTime() > Date.now()) throw new BadRequestException('A data da publicação não pode estar no futuro.');
    const ato = l.data_publicacao_edital ? new Date(l.data_publicacao_edital) : null;
    if (ato && data.getTime() < ato.getTime() - 86_400_000) {
      throw new BadRequestException('A publicação oficial não pode ser anterior ao ato de publicação do processo.');
    }
    const r = await confirmarDivulgacaoOficial(this.transicoes, this.ds, id, { data_divulgacao: data, meio: 'DIARIO_OFICIAL', referencia }, ator);
    return { confirmada: r.confirmada, fase: r.licitacao?.fase ?? null, cronograma_ajustado: r.cronograma_ajustado ?? [], ajuste: r.ajuste_descricao ?? null };
  }
}
