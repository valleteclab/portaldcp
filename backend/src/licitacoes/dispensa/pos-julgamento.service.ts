import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { atorTransicaoDe } from '../transicoes/transicoes.tipos';
import { LicitacoesService } from '../licitacoes.service';
import { HabilitacaoDispensa, NegociacaoDispensa } from './pos-julgamento.entities';

/** Documentos de habilitação conferidos na contratação direta (art. 72, V; arts. 62–70). */
export const DOCUMENTOS_HABILITACAO_DISPENSA = [
  'Habilitação jurídica (ato constitutivo / registro)',
  'Regularidade fiscal federal e dívida ativa da União (CND)',
  'Regularidade com o FGTS (CRF)',
  'Regularidade trabalhista (CNDT)',
  'Regularidade fiscal estadual e municipal',
  'Declarações do art. 63 (menores, reserva de cargos, custos trabalhistas)',
];

const MIN_MOTIVO = 10;

/**
 * DEPOIS DO JULGAMENTO DA DISPENSA ELETRÔNICA — habilitação do vencedor e
 * negociação com aceite do fornecedor (homologação 08/11/2026).
 */
@Injectable()
export class DispensaPosJulgamentoService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly licitacoes: LicitacoesService,
  ) {}

  private async licitacao(id: string) {
    const [l] = await this.ds.query(
      `SELECT id::text AS id, modalidade::text AS modalidade, fase::text AS fase, data_homologacao FROM licitacoes WHERE id::text = $1`,
      [id],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    if (l.modalidade !== 'DISPENSA_ELETRONICA') throw new BadRequestException('Disponível apenas na dispensa eletrônica');
    return l;
  }

  private async exigirAntesDaHomologacao(id: string) {
    const l = await this.licitacao(id);
    if (l.data_homologacao || l.fase === 'HOMOLOGACAO') throw new ConflictException('Dispensa já homologada');
    if (l.fase !== 'ADJUDICACAO') throw new ConflictException('Disponível depois do julgamento (vencedor definido)');
    return l;
  }

  private async nomeDoAtor(ator: Ator): Promise<string> {
    if (ator.tipo === 'USUARIO' && ator.usuarioId) {
      const [u] = await this.ds.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
      if (u?.nome) return u.nome;
    }
    return ator.admin ? 'Administrador' : 'Órgão';
  }

  /** Vencedores, itens adjudicados, habilitação e negociações — para a tela do órgão. */
  async painel(id: string) {
    await this.licitacao(id);
    const itens: any[] = await this.ds.query(
      `SELECT i.id::text AS item_id, i.numero_item, i.descricao_resumida AS descricao, i.quantidade, i.fornecedor_vencedor_id::text AS fornecedor_id,
              COALESCE(i.fornecedor_vencedor_nome, f.razao_social) AS razao_social,
              i.valor_unitario_homologado AS valor_unitario, i.valor_total_homologado AS valor_total
         FROM itens_licitacao i LEFT JOIN fornecedores f ON f.id::text = i.fornecedor_vencedor_id::text
        WHERE i.licitacao_id::text = $1 AND i.status::text IN ('ADJUDICADO', 'HOMOLOGADO') AND i.fornecedor_vencedor_id IS NOT NULL
        ORDER BY i.numero_item`,
      [id],
    );
    const habs: any[] = await this.ds.query(
      `SELECT DISTINCT ON (fornecedor_id) fornecedor_id::text AS fornecedor_id, resultado, motivo, conferidos, registrado_por_nome, created_at
         FROM habilitacoes_dispensa WHERE licitacao_id::text = $1 ORDER BY fornecedor_id, created_at DESC`,
      [id],
    );
    const negs: any[] = await this.ds.query(
      `SELECT id::text AS id, item_licitacao_id::text AS item_id, fornecedor_id::text AS fornecedor_id, valor_unitario, valor_anterior,
              status, mensagem, motivo_recusa, proposta_por_nome, respondida_em, created_at
         FROM negociacoes_dispensa WHERE licitacao_id::text = $1 ORDER BY created_at DESC`,
      [id],
    );
    const porFornecedor = new Map<string, any>();
    for (const it of itens) {
      const v = porFornecedor.get(it.fornecedor_id) ?? { fornecedor_id: it.fornecedor_id, razao_social: it.razao_social, itens: [], habilitacao: null, negociacoes: [] };
      v.itens.push({ item_id: it.item_id, numero: it.numero_item, descricao: it.descricao, quantidade: Number(it.quantidade), valor_unitario: Number(it.valor_unitario), valor_total: Number(it.valor_total) });
      porFornecedor.set(it.fornecedor_id, v);
    }
    for (const h of habs) if (porFornecedor.has(h.fornecedor_id)) porFornecedor.get(h.fornecedor_id).habilitacao = h;
    for (const n of negs) if (porFornecedor.has(n.fornecedor_id)) porFornecedor.get(n.fornecedor_id).negociacoes.push({ ...n, valor_unitario: Number(n.valor_unitario), valor_anterior: Number(n.valor_anterior) });
    const vencedores = [...porFornecedor.values()];
    return {
      documentos: DOCUMENTOS_HABILITACAO_DISPENSA,
      vencedores,
      todos_habilitados: vencedores.length > 0 && vencedores.every((v) => v.habilitacao?.resultado === 'HABILITADO'),
    };
  }

  /** Registra a habilitação do vencedor. Inabilitado: proposta desclassificada e rejulgamento (próximo da classificação). */
  async registrarHabilitacao(id: string, ator: Ator, body: { fornecedor_id?: string; resultado?: string; motivo?: string; conferidos?: string[] }) {
    await this.exigirAntesDaHomologacao(id);
    const resultado = String(body?.resultado ?? '').toUpperCase();
    if (!['HABILITADO', 'INABILITADO'].includes(resultado)) throw new BadRequestException('Informe HABILITADO ou INABILITADO');
    const fornecedorId = String(body?.fornecedor_id ?? '');
    const [venc] = await this.ds.query(
      `SELECT 1 FROM itens_licitacao WHERE licitacao_id::text = $1 AND fornecedor_vencedor_id::text = $2 AND status::text = 'ADJUDICADO' LIMIT 1`,
      [id, fornecedorId],
    );
    if (!venc) throw new BadRequestException('Só o vencedor de algum item passa pela habilitação');
    const motivo = String(body?.motivo ?? '').trim();
    const conferidos = (Array.isArray(body?.conferidos) ? body.conferidos : []).map((c) => String(c).slice(0, 200)).slice(0, 30);
    if (resultado === 'INABILITADO' && motivo.length < MIN_MOTIVO) throw new BadRequestException(`Informe o motivo da inabilitação (mínimo ${MIN_MOTIVO} caracteres)`);
    if (resultado === 'HABILITADO' && !conferidos.length) throw new BadRequestException('Marque os documentos conferidos');
    const nome = await this.nomeDoAtor(ator);
    await this.ds.getRepository(HabilitacaoDispensa).save({ licitacao_id: id, fornecedor_id: fornecedorId, resultado, motivo: motivo || null, conferidos, registrado_por_nome: nome });
    if (resultado === 'HABILITADO') return this.painel(id);
    // Inabilitado: a proposta sai da disputa e o próximo da classificação é chamado (rejulgamento)
    await this.ds.query(
      `UPDATE propostas SET status = 'DESCLASSIFICADA', motivo_desclassificacao = $3, data_analise = now()
        WHERE licitacao_id::text = $1 AND fornecedor_id::text = $2 AND status::text NOT IN ('RASCUNHO','CANCELADA')`,
      [id, fornecedorId, `Inabilitado (art. 72, V; IN SEGES 67/2021, art. 17): ${motivo}`],
    );
    await this.licitacoes.julgarDispensa(id, atorTransicaoDe(ator)).catch((e) => {
      throw new ConflictException(`Inabilitação registrada, mas o rejulgamento falhou: ${e?.message ?? e}`);
    });
    return this.painel(id);
  }

  /** Contraproposta do órgão ao vencedor do item (IN 67, art. 16) — o fornecedor aceita ou recusa. */
  async proporValor(id: string, ator: Ator, body: { item_id?: string; valor_unitario?: number | string; mensagem?: string }) {
    await this.exigirAntesDaHomologacao(id);
    const [it] = await this.ds.query(
      `SELECT id::text AS id, numero_item, fornecedor_vencedor_id::text AS fornecedor_id, valor_unitario_homologado AS atual
         FROM itens_licitacao WHERE id::text = $1 AND licitacao_id::text = $2 AND status::text = 'ADJUDICADO'`,
      [String(body?.item_id ?? ''), id],
    );
    if (!it?.fornecedor_id) throw new BadRequestException('Item sem vencedor adjudicado');
    const valor = Number(String(body?.valor_unitario ?? '').replace(',', '.'));
    if (!(valor > 0)) throw new BadRequestException('Informe o valor unitário proposto');
    if (!(valor < Number(it.atual))) throw new BadRequestException(`A contraproposta precisa ser menor que o valor atual (R$ ${Number(it.atual).toFixed(2)})`);
    await this.ds.query(`UPDATE negociacoes_dispensa SET status = 'CANCELADA' WHERE licitacao_id::text = $1 AND item_licitacao_id::text = $2 AND status = 'PENDENTE'`, [id, it.id]);
    const nome = await this.nomeDoAtor(ator);
    const mensagem = String(body?.mensagem ?? '').trim().slice(0, 600) || null;
    await this.ds.getRepository(NegociacaoDispensa).save({
      licitacao_id: id, item_licitacao_id: it.id, fornecedor_id: it.fornecedor_id, valor_unitario: String(valor), valor_anterior: String(it.atual),
      status: 'PENDENTE', mensagem, proposta_por_nome: nome,
    });
    await this.licitacoes.enviarMensagemDispensa(id, {
      autor_tipo: 'ORGAO', autor_nome: nome, fornecedor_destino_id: it.fornecedor_id,
      mensagem: `Contraproposta do órgão para o item ${it.numero_item}: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por unidade (valor atual R$ ${Number(it.atual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Aceite ou recuse na sala da sessão.${mensagem ? ` ${mensagem}` : ''}`,
    }).catch(() => undefined);
    return this.painel(id);
  }

  /** Contrapropostas pendentes do fornecedor logado. */
  async pendentesDoFornecedor(id: string, fornecedorId: string) {
    await this.licitacao(id);
    return this.ds.query(
      `SELECT n.id::text AS id, n.item_licitacao_id::text AS item_id, i.numero_item, i.descricao_resumida AS descricao, i.quantidade, n.valor_unitario, n.valor_anterior, n.mensagem, n.status, n.created_at
         FROM negociacoes_dispensa n JOIN itens_licitacao i ON i.id = n.item_licitacao_id
        WHERE n.licitacao_id::text = $1 AND n.fornecedor_id::text = $2 ORDER BY n.created_at DESC`,
      [id, fornecedorId],
    );
  }

  /** O fornecedor aceita (o valor vira o adjudicado) ou recusa a contraproposta. */
  async responder(id: string, negociacaoId: string, fornecedorId: string, body: { aceitar?: boolean; motivo?: string }) {
    await this.exigirAntesDaHomologacao(id);
    const repo = this.ds.getRepository(NegociacaoDispensa);
    const n = await repo.findOne({ where: { id: negociacaoId, licitacao_id: id, fornecedor_id: fornecedorId } });
    if (!n) throw new NotFoundException('Contraproposta não encontrada');
    if (n.status !== 'PENDENTE') throw new ConflictException('Contraproposta já respondida');
    const aceitar = body?.aceitar === true;
    const [f] = await this.ds.query(`SELECT razao_social FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
    await this.ds.transaction(async (m) => {
      n.status = aceitar ? 'ACEITA' : 'RECUSADA';
      n.motivo_recusa = aceitar ? null : String(body?.motivo ?? '').trim().slice(0, 600) || null;
      n.respondida_em = new Date();
      await m.getRepository(NegociacaoDispensa).save(n);
      if (aceitar) {
        await m.query(
          `UPDATE itens_licitacao SET valor_unitario_homologado = $3, valor_total_homologado = ROUND(($3::numeric * quantidade)::numeric, 2), updated_at = now()
            WHERE id::text = $1 AND licitacao_id::text = $2 AND fornecedor_vencedor_id::text = $4`,
          [n.item_licitacao_id, id, n.valor_unitario, fornecedorId],
        );
      }
    });
    const valor = Number(n.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    await this.licitacoes.enviarMensagemDispensa(id, {
      autor_tipo: 'FORNECEDOR', fornecedor_id: fornecedorId,
      mensagem: aceitar
        ? `Contraproposta ACEITA: R$ ${valor} por unidade.`
        : `Contraproposta recusada (R$ ${valor}).${n.motivo_recusa ? ` Motivo: ${n.motivo_recusa}` : ''}`,
    }).catch(() => undefined);
    return { status: n.status, fornecedor: f?.razao_social ?? null };
  }
}
