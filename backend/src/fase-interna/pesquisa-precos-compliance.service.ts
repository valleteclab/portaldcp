import { Injectable } from '@nestjs/common';
import { PesquisaPrecoCandidato } from './entities/pesquisa-preco-candidato.entity';
import { FontePesquisaTipo } from './types/pesquisa-precos.type';
import { PesquisaPrecoCandidateInput } from './pesquisa-precos-agent.types';

@Injectable()
export class PesquisaPrecosComplianceService {
  normalizarValor(valor: unknown): number {
    const n = Number(valor);
    return Number.isFinite(n) ? Number(n.toFixed(4)) : 0;
  }

  normalizarData(valor: unknown): string {
    const hoje = new Date().toISOString().split('T')[0];
    if (!valor) return hoje;
    const texto = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    if (/^\d{4}$/.test(texto)) return `${texto}-01-01`;
    const matchAnoMes = texto.match(/^(\d{4})-(\d{2})$/);
    if (matchAnoMes) return `${matchAnoMes[1]}-${matchAnoMes[2]}-01`;
    const matchBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (matchBr) return `${matchBr[3]}-${matchBr[2]}-${matchBr[1]}`;
    const data = new Date(texto);
    if (!Number.isNaN(data.getTime())) return data.toISOString().split('T')[0];
    return hoje;
  }

  prepararCandidato(candidato: PesquisaPrecoCandidateInput): PesquisaPrecoCandidateInput | null {
    const valor = this.normalizarValor(candidato.valor_unitario);
    if (valor <= 0 || !candidato.item_numero || !candidato.fonte_tipo) {
      return null;
    }

    const flags = new Set(candidato.flags || []);
    if (candidato.fonte_tipo === 'FORNECEDOR_DIRETO' && !candidato.fornecedor_cnpj) {
      flags.add('Fornecedor direto sem CNPJ: precisa completar antes de usar como fonte oficial.');
    }
    if (!candidato.url_referencia && !candidato.evidencia?.path) {
      flags.add('Sem URL ou documento de evidencia.');
    }

    return {
      ...candidato,
      data_pesquisa: this.normalizarData(candidato.data_pesquisa),
      valor_unitario: valor,
      score: Number((candidato.score ?? this.scorePorFonte(candidato.fonte_tipo, flags.size)).toFixed(2)),
      flags: [...flags],
    };
  }

  deduplicar(candidatos: PesquisaPrecoCandidateInput[]): PesquisaPrecoCandidateInput[] {
    const vistos = new Set<string>();
    const saida: PesquisaPrecoCandidateInput[] = [];

    for (const candidato of candidatos) {
      const chave = [
        candidato.item_numero,
        candidato.fonte_tipo,
        (candidato.url_referencia || '').toLowerCase(),
        this.normalizarTexto(candidato.descricao_fonte),
        this.normalizarValor(candidato.valor_unitario),
      ].join('|');

      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(candidato);
    }

    return saida.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  resumir(candidatos: PesquisaPrecoCandidato[]) {
    const porItem = new Map<number, PesquisaPrecoCandidato[]>();
    for (const candidato of candidatos) {
      porItem.set(candidato.item_numero, [...(porItem.get(candidato.item_numero) || []), candidato]);
    }

    const itens = [...porItem.entries()].map(([itemNumero, lista]) => {
      const fontes = new Set(lista.map((c) => c.fonte_tipo));
      const valores = lista.map((c) => Number(c.valor_unitario)).filter((v) => v > 0);
      const media = valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;
      const desvio = valores.length
        ? Math.sqrt(valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / valores.length)
        : 0;
      const cv = media > 0 ? (desvio / media) * 100 : 0;
      const alertas: string[] = [];

      if (fontes.size < 3) alertas.push(`Item ${itemNumero}: menos de 3 fontes distintas encontradas.`);
      if (cv > 25) alertas.push(`Item ${itemNumero}: variacao elevada (${cv.toFixed(1)}%). Avalie outliers.`);
      if (lista.some((c) => (c.flags || []).length > 0)) alertas.push(`Item ${itemNumero}: ha candidatos com pendencias de evidencia.`);

      return {
        itemNumero,
        totalCandidatos: lista.length,
        fontesDistintas: fontes.size,
        media: Number(media.toFixed(4)),
        cvPercent: Number(cv.toFixed(2)),
        conforme: fontes.size >= 3 && alertas.length === 0,
        alertas,
      };
    });

    return {
      totalCandidatos: candidatos.length,
      totalAprovados: candidatos.filter((c) => c.status === 'APROVADO').length,
      totalRejeitados: candidatos.filter((c) => c.status === 'REJEITADO').length,
      itens,
      conforme: itens.length > 0 && itens.every((i) => i.conforme),
    };
  }

  private scorePorFonte(fonte: FontePesquisaTipo, pendencias: number): number {
    const base: Record<FontePesquisaTipo, number> = {
      PAINEL_DE_PRECOS: 95,
      PNCP: 92,
      CONTRATO_VIGENTE_SISTEMA: 88,
      MIDIA_ESPECIALIZADA: 72,
      FORNECEDOR_DIRETO: 68,
      NOTA_FISCAL_ELETRONICA: 84,
      OUTRA: 50,
    };
    return Math.max(0, (base[fonte] || 50) - pendencias * 12);
  }

  private normalizarTexto(valor: string): string {
    return (valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
