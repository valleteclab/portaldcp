import { Injectable } from '@nestjs/common';
import { IaService } from '../ia/ia.service';

type ConfiancaAgente = 'high' | 'medium' | 'low';

type FerramentaAgente = {
  nome: string;
  titulo: string;
  tipo: 'read' | 'write' | 'control' | 'respond';
  confianca: ConfiancaAgente;
  bloqueio?: string;
  origem?: 'heuristica' | 'llm';
};

type IntencaoAgente =
  | 'greeting'
  | 'negative_feedback'
  | 'help'
  | 'structured_data'
  | 'unknown';

export type PlanoTurnoMedicaoChat = {
  intencao: IntencaoAgente;
  confianca: ConfiancaAgente;
  resumo_intencao: string;
  deve_escrever_rascunho: boolean;
  deve_reverter_ultima_inferencia: boolean;
  ferramentas: FerramentaAgente[];
  bloqueios: string[];
  proxima_melhor_acao?: string;
  resposta_base?: string;
  llm?: Record<string, any> | null;
};

@Injectable()
export class MedicaoChatAgentService {
  constructor(private readonly iaService: IaService) {}

  async planejarTurno(input: {
    contrato: Record<string, any>;
    resumo?: Record<string, any> | null;
    draft?: Record<string, any> | null;
    contexto?: Record<string, any> | null;
    mensagem: string;
    tem_snapshot_draft?: boolean;
  }): Promise<PlanoTurnoMedicaoChat> {
    const mensagem = String(input.mensagem || '').trim();
    const heuristica = this.classificarIntencao(mensagem);

    if (heuristica.intencao === 'greeting') {
      return {
        intencao: 'greeting',
        confianca: 'high',
        resumo_intencao: 'O usuario enviou uma saudacao ou mensagem social curta.',
        deve_escrever_rascunho: false,
        deve_reverter_ultima_inferencia: false,
        ferramentas: [
          {
            nome: 'responder_contexto',
            titulo: 'Responder sem alterar o rascunho',
            tipo: 'respond',
            confianca: 'high',
            origem: 'heuristica',
          },
          {
            nome: 'ler_contexto_contrato',
            titulo: 'Relembrar contexto atual do contrato',
            tipo: 'read',
            confianca: 'medium',
            origem: 'heuristica',
          },
        ],
        bloqueios: [
          'Mensagem social nao deve atualizar periodo, NF, itens ou discriminacoes.',
        ],
        resposta_base:
          'Recebi sua mensagem social. Vou manter o rascunho intacto e te orientar pelo proximo passo util.',
        proxima_melhor_acao: this.sugerirProximaAcao(input.draft),
      };
    }

    if (heuristica.intencao === 'negative_feedback') {
      return {
        intencao: 'negative_feedback',
        confianca: 'high',
        resumo_intencao:
          'O usuario sinalizou que a ultima inferencia do agente esta errada.',
        deve_escrever_rascunho: false,
        deve_reverter_ultima_inferencia: Boolean(input.tem_snapshot_draft),
        ferramentas: [
          {
            nome: input.tem_snapshot_draft
              ? 'reverter_ultima_inferencia'
              : 'responder_contexto',
            titulo: input.tem_snapshot_draft
              ? 'Desfazer a ultima inferencia automatica'
              : 'Reconhecer erro e pedir correcao minima',
            tipo: input.tem_snapshot_draft ? 'control' : 'respond',
            confianca: 'high',
            origem: 'heuristica',
          },
        ],
        bloqueios: [
          'Nao devo continuar escrevendo no rascunho enquanto o usuario aponta erro.',
        ],
        resposta_base: input.tem_snapshot_draft
          ? 'Entendi que a ultima inferencia ficou errada. Vou desfazer o ultimo preenchimento automatico antes de continuar.'
          : 'Entendi que a ultima interpretacao ficou errada. Nao vou alterar o rascunho agora; preciso que voce me diga apenas o ponto a corrigir.',
        proxima_melhor_acao:
          'Pedir a menor correcao possivel ao usuario antes de voltar a escrever no boletim.',
      };
    }

    if (heuristica.intencao === 'help') {
      return {
        intencao: 'help',
        confianca: 'high',
        resumo_intencao:
          'O usuario pediu orientacao, status ou proximo passo, sem informar dado estruturado.',
        deve_escrever_rascunho: false,
        deve_reverter_ultima_inferencia: false,
        ferramentas: [
          {
            nome: 'ler_contexto_contrato',
            titulo: 'Ler contexto do contrato e do rascunho',
            tipo: 'read',
            confianca: 'high',
            origem: 'heuristica',
          },
          {
            nome: 'responder_contexto',
            titulo: 'Responder com orientacao contextual',
            tipo: 'respond',
            confianca: 'high',
            origem: 'heuristica',
          },
        ],
        bloqueios: [],
        resposta_base:
          'Vou te orientar com base no contrato, no saldo e no que ja esta preenchido, sem alterar o rascunho.',
        proxima_melhor_acao: this.sugerirProximaAcao(input.draft),
      };
    }

    const llm = await this.iaService.planejarAcoesMedicaoAssistida({
      contrato: input.contrato,
      resumo: input.resumo,
      draft: input.draft,
      contexto: input.contexto,
      mensagem,
    });

    const ferramentas = this.normalizarFerramentas(llm, mensagem);
    const bloqueios = ferramentas
      .filter((item) => item.bloqueio)
      .map((item) => item.bloqueio as string);

    return {
      intencao: heuristica.intencao,
      confianca: llm ? 'medium' : heuristica.confianca,
      resumo_intencao:
        llm?.resumo_intencao ||
        heuristica.resumo ||
        'O usuario informou dados potencialmente aproveitaveis para a medicao.',
      deve_escrever_rascunho: ferramentas.some((item) => item.tipo === 'write'),
      deve_reverter_ultima_inferencia: false,
      ferramentas,
      bloqueios,
      proxima_melhor_acao:
        llm?.resposta_sugerida || this.sugerirProximaAcao(input.draft),
      llm,
    };
  }

  private classificarIntencao(mensagem: string): {
    intencao: IntencaoAgente;
    confianca: ConfiancaAgente;
    resumo?: string;
  } {
    const texto = mensagem.trim();
    if (!texto) {
      return {
        intencao: 'unknown',
        confianca: 'low',
      };
    }

    if (
      /^(oi|ola|ol[aá]|opa|e ai|bom dia|boa tarde|boa noite)\b/i.test(texto) &&
      texto.length <= 40 &&
      !/\d/.test(texto)
    ) {
      return {
        intencao: 'greeting',
        confianca: 'high',
        resumo: 'Saudacao simples sem dado estruturado.',
      };
    }

    if (
      /\best[aá] tudo errado\b|\best[aá] errado\b|\btudo errado\b|\bn[aã]o e isso\b|\bn[aã]o era isso\b|\bentendeu errado\b|\bvc entendeu errado\b|\bvoce entendeu errado\b|\bcorrige isso\b|\bdesfaz\b/i.test(
        texto,
      )
    ) {
      return {
        intencao: 'negative_feedback',
        confianca: 'high',
        resumo: 'Feedback negativo claro sobre a inferencia atual.',
      };
    }

    if (
      /\bo que falta\b|\bqual o proximo\b|\bpr[oó]ximo passo\b|\bme ajuda\b|\bcomo faco\b|\bcomo fazer\b|\bexplica\b|\bnao entendi\b/i.test(
        texto,
      )
    ) {
      return {
        intencao: 'help',
        confianca: 'high',
        resumo: 'Pedido de orientacao ou esclarecimento.',
      };
    }

    return {
      intencao: 'structured_data',
      confianca: 'medium',
      resumo: 'Mensagem com potencial de atualizar o rascunho.',
    };
  }

  private normalizarFerramentas(
    llm: Record<string, any> | null,
    mensagem: string,
  ): FerramentaAgente[] {
    const ferramentas: FerramentaAgente[] = [];

    for (const acao of llm?.acoes || []) {
      const nome = this.normalizarNomeFerramenta(acao?.ferramenta, mensagem);
      ferramentas.push({
        nome,
        titulo: acao?.objetivo || nome,
        tipo: this.tipoDaFerramenta(nome),
        confianca: acao?.confianca || 'medium',
        bloqueio:
          typeof acao?.bloqueio === 'string' && acao.bloqueio.trim()
            ? acao.bloqueio.trim()
            : undefined,
        origem: 'llm',
      });
    }

    if (ferramentas.length > 0) {
      return ferramentas;
    }

    return this.ferramentasFallback(mensagem);
  }

  private ferramentasFallback(mensagem: string): FerramentaAgente[] {
    const ferramentas: FerramentaAgente[] = [];
    if (
      /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2}/.test(mensagem) ||
      /(?:^|[^\d])\d{1,2}\s*[\/.\-\s]\s*\d{1,2}(?:\s*[\/.\-\s]\s*\d{2,4})?\s*(?:a|ate|até|ao|à|-|–|—)\s*\d{1,2}\s*[\/.\-\s]\s*\d{1,2}/i.test(
        mensagem,
      )
    ) {
      ferramentas.push({
        nome: 'atualizar_periodo',
        titulo: 'Atualizar periodo da medicao',
        tipo: 'write',
        confianca: 'high',
        origem: 'heuristica',
      });
    }
    if (/(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/?\d{4}|\d{2}\/\d{4}/i.test(mensagem)) {
      ferramentas.push({
        nome: 'atualizar_competencia',
        titulo: 'Atualizar competencia',
        tipo: 'write',
        confianca: 'medium',
        origem: 'heuristica',
      });
    }
    if (/\bnf\b|\bnota\b/i.test(mensagem)) {
      ferramentas.push({
        nome: 'atualizar_nota_fiscal',
        titulo: 'Atualizar dados da nota fiscal',
        tipo: 'write',
        confianca: 'medium',
        origem: 'heuristica',
      });
    }
    if (/item\s*\d+\s*[:=]|etapa\s*\d+\s*[:=]|valor medido|valor do periodo|medi[cç][aã]o/i.test(mensagem)) {
      ferramentas.push({
        nome: 'atualizar_execucao_medicao',
        titulo: 'Atualizar execucao da medicao',
        tipo: 'write',
        confianca: 'medium',
        origem: 'heuristica',
      });
    }
    if (/discrimin|descrim|irrf|iss|imposto|taxa|tribut|operacion|servi[cç]os|material/i.test(mensagem)) {
      ferramentas.push({
        nome: 'atualizar_discriminacoes',
        titulo: 'Atualizar composicao financeira da despesa',
        tipo: 'write',
        confianca: 'medium',
        origem: 'heuristica',
      });
    }
    if (/observa|sem observ/i.test(mensagem)) {
      ferramentas.push({
        nome: 'atualizar_observacoes',
        titulo: 'Atualizar observacoes',
        tipo: 'write',
        confianca: 'medium',
        origem: 'heuristica',
      });
    }

    if (ferramentas.length === 0) {
      ferramentas.push({
        nome: 'responder_contexto',
        titulo: 'Responder sem alterar o rascunho',
        tipo: 'respond',
        confianca: 'low',
        origem: 'heuristica',
      });
    }

    return ferramentas;
  }

  private normalizarNomeFerramenta(
    ferramenta: string | undefined,
    mensagem: string,
  ): string {
    const valor = String(ferramenta || '').toLowerCase();
    if (valor.includes('period')) return 'atualizar_periodo';
    if (valor.includes('compet')) return 'atualizar_competencia';
    if (valor.includes('nota') || valor.includes('nf')) return 'atualizar_nota_fiscal';
    if (valor.includes('discrimin')) return 'atualizar_discriminacoes';
    if (
      valor.includes('medicao') ||
      valor.includes('item') ||
      valor.includes('etapa') ||
      valor.includes('valor')
    ) {
      return 'atualizar_execucao_medicao';
    }
    if (valor.includes('observ')) return 'atualizar_observacoes';
    if (valor.includes('contrato') || valor.includes('resumo')) {
      return 'ler_contexto_contrato';
    }
    return this.ferramentasFallback(mensagem)[0]?.nome || 'responder_contexto';
  }

  private tipoDaFerramenta(nome: string): FerramentaAgente['tipo'] {
    if (nome.startsWith('ler_')) return 'read';
    if (nome.startsWith('atualizar_')) return 'write';
    if (nome.startsWith('reverter_')) return 'control';
    return 'respond';
  }

  private sugerirProximaAcao(draft?: Record<string, any> | null) {
    if (!draft?.periodo_inicio || !draft?.periodo_fim) {
      return 'Pedir o periodo da medicao.';
    }
    if (!draft?.competencia) {
      return 'Pedir a competencia da medicao.';
    }
    if (!draft?.valor_medido && (!Array.isArray(draft?.itens) || draft.itens.length === 0)) {
      return 'Preencher a execucao da medicao com valor, itens ou etapas.';
    }
    if (!draft?.nota_fiscal_numero && !draft?.nota_fiscal_valor) {
      return 'Pedir o numero da nota fiscal ou receber XML/PDF.';
    }
    if (!Array.isArray(draft?.discriminacoes) || draft.discriminacoes.length === 0) {
      return 'Completar a composicao financeira da despesa: ISS, impostos/taxas, despesas operacionais, servicos ou outros percentuais/valores.';
    }
    if (draft?.observacoes == null) {
      return 'Perguntar se ha observacoes finais.';
    }
    return 'Revisar o rascunho e orientar o envio manual ao ateste.';
  }
}
