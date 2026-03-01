import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotaFiscalFornecedor, MapeamentoAiItem } from './entities/nota-fiscal-fornecedor.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { IaService } from '../ia/ia.service';

@Injectable()
export class MatchingIaService {
  private readonly logger = new Logger(MatchingIaService.name);

  constructor(
    @InjectRepository(NotaFiscalFornecedor)
    private readonly nfRepository: Repository<NotaFiscalFornecedor>,
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    private readonly iaService: IaService,
  ) {}

  async matchProdutos(nfId: string, ordemId: string): Promise<{
    mapeamento: MapeamentoAiItem[];
    ia_indisponivel: boolean;
  }> {
    const nf = await this.nfRepository.findOne({ where: { id: nfId } });
    if (!nf) throw new Error('Nota fiscal não encontrada');

    const ordem = await this.ordemRepository.findOne({ where: { id: ordemId } });
    if (!ordem) throw new Error('Ordem de fornecimento não encontrada');

    const produtosNf = nf.produtos_xml || [];
    let todosItens = ordem.itens || [];
    // Quando NF tem tipo_itens (separada): apenas itens desse tipo
    if ((nf as any).tipo_itens) {
      const tipo = (nf as any).tipo_itens;
      todosItens = todosItens.filter((i: any) => (i.tipo_item || 'CONSUMO') === tipo);
    }
    // REQ-ALM-001: apenas itens com saldo pendente (não totalmente recebidos)
    const itensOf = todosItens.filter(
      (item: any) => (item.quantidade_entregue ?? 0) < (item.quantidade ?? 0),
    );

    if (produtosNf.length === 0) {
      return { mapeamento: [], ia_indisponivel: false };
    }

    const tipoItensNf = (nf as any).tipo_itens as string | undefined;
    const prompt = this.buildPrompt(produtosNf, itensOf, tipoItensNf);

    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const resposta = await this.iaService.chat([
          { role: 'user', content: prompt },
        ]);

        let mapeamento = this.parseResposta(resposta, produtosNf);

        // Pós-processamento: quando NF tem tipo, invalidar matches com valor muito diferente
        const tipoNf = (nf as any).tipo_itens;
        if (tipoNf && itensOf.length > 0) {
          mapeamento = mapeamento.map((m) => {
            if (!m.item_contrato_id) return m;
            const prod = produtosNf.find((p: any) => (p.nItem || 0) === m.produto_nf_index);
            const ofItem = itensOf.find((i: any) => i.item_contrato_id === m.item_contrato_id);
            if (!prod?.vUnCom || !ofItem?.valor_unitario) return m;
            const ratio = Number(prod.vUnCom) / Number(ofItem.valor_unitario);
            if (ratio > 5 || ratio < 0.2) {
              return { ...m, item_contrato_id: null, descricao_of: null, confianca: 0, justificativa: 'Valor incompatível — produto provavelmente de outro tipo' };
            }
            return m;
          });
        }

        await this.nfRepository.update(nfId, { mapeamento_ai: mapeamento });

        return { mapeamento, ia_indisponivel: false };
      } catch (error) {
        this.logger.error(`Tentativa ${tentativa + 1} de matching IA falhou: ${error.message}`);
        if (tentativa === 1) {
          this.logger.error('IA indisponível após 2 tentativas');
          const mapeamentoVazio: MapeamentoAiItem[] = produtosNf.map((p, i) => ({
            produto_nf_index: p.nItem || i + 1,
            xProd_nf: p.xProd,
            item_contrato_id: null,
            descricao_of: null,
            confianca: 0,
            justificativa: 'IA indisponível - mapeamento manual necessário',
          }));
          return { mapeamento: mapeamentoVazio, ia_indisponivel: true };
        }
      }
    }

    return { mapeamento: [], ia_indisponivel: true };
  }

  private buildPrompt(
    produtosNf: any[],
    itensOf: any[],
    tipoItens?: string,
  ): string {
    const nfList = produtosNf.map((p, i) => ({
      index: p.nItem || i + 1,
      descricao: p.xProd,
      quantidade: p.qCom,
      unidade: p.uCom,
      valor_unitario: p.vUnCom,
    }));

    const ofList = itensOf.map(item => ({
      item_contrato_id: item.item_contrato_id,
      descricao: item.descricao,
      unidade: item.unidade_medida,
      quantidade: item.quantidade,
      quantidade_restante: (item.quantidade ?? 0) - (item.quantidade_entregue ?? 0),
      valor_unitario: item.valor_unitario,
    }));
    const regraTipo = tipoItens
      ? `IMPORTANTE: Esta NF é EXCLUSIVAMENTE para itens de ${tipoItens}. Os itens da OF listados são todos desse tipo. NÃO vincule produtos da NF que sejam claramente de outro tipo (ex: notebooks, computadores, impressoras em NF de CONSUMO são equipamentos permanentes). Para esses produtos, retorne item_contrato_id como null. Use o valor unitário como critério forte: se o produto da NF tiver valor muito diferente (ex: 10x ou mais) do item da OF, provavelmente são tipos diferentes — retorne null.`
      : '';

    return `Você é um assistente de mapeamento de produtos. Compare os produtos da Nota Fiscal com os itens da Ordem de Fornecimento e faça o vínculo.

PRODUTOS DA NOTA FISCAL:
${JSON.stringify(nfList, null, 2)}

ITENS DA ORDEM DE FORNECIMENTO:
${JSON.stringify(ofList, null, 2)}

${regraTipo ? `REGRAS ESPECIAIS (NF separada - tipo ${tipoItens}):
${regraTipo}

` : ''}REGRAS GERAIS:
1. Para cada produto da NF, encontre o item mais provável na OF
2. Atribua uma confiança de 0 a 100
3. Se não encontrar correspondência, retorne item_contrato_id como null
4. Considere variações de nome, abreviações e descrições técnicas
5. Considere unidade de medida e valor unitário como fatores adicionais

Retorne APENAS um array JSON (sem markdown, sem code fences) no formato:
[
  {
    "produto_nf_index": 1,
    "xProd_nf": "DESCRICAO DO PRODUTO NF",
    "item_contrato_id": "uuid-do-item-of-ou-null",
    "descricao_of": "Descrição do item na OF ou null",
    "confianca": 95,
    "justificativa": "Motivo do match"
  }
]`;
  }

  private parseResposta(resposta: string, produtosNf: any[]): MapeamentoAiItem[] {
    let jsonStr = resposta.trim();

    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        throw new Error('Resposta não é um array');
      }
      return parsed.map((item: any) => ({
        produto_nf_index: Number(item.produto_nf_index) || 0,
        xProd_nf: String(item.xProd_nf || ''),
        item_contrato_id: item.item_contrato_id || null,
        descricao_of: item.descricao_of || null,
        confianca: Math.min(100, Math.max(0, Number(item.confianca) || 0)),
        justificativa: String(item.justificativa || ''),
      }));
    } catch (error) {
      this.logger.error(`Erro ao parsear resposta IA: ${error.message}`);
      this.logger.debug(`Resposta bruta: ${resposta.substring(0, 500)}`);
      throw new Error(`Falha ao interpretar resposta da IA: ${error.message}`);
    }
  }
}
