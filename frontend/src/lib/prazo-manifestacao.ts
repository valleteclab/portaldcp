/**
 * Prazo de impugnação e de pedido de esclarecimento (Lei 14.133/2021, art. 164:
 * até 3 dias úteis antes da abertura do certame).
 *
 * O backend calcula e envia na licitação (visões do órgão, fornecedor e
 * pública) — a tela NÃO recalcula a regra:
 *  - `data_limite_impugnacao_efetiva`: a data-limite do edital ou, sem ela,
 *    3 dias úteis antes da abertura (fim do dia, horário de Brasília);
 *  - `prazo_manifestacao_aberto`: se cabe impugnação/esclarecimento agora.
 * O prazo corre em paralelo ao acolhimento de propostas — não depende da fase.
 */
export interface LicitacaoComPrazoManifestacao {
  fase?: string
  data_limite_impugnacao?: string | null
  data_limite_impugnacao_efetiva?: string | null
  prazo_manifestacao_aberto?: boolean
}

/** Cabe impugnação/esclarecimento agora? (usa o que o backend calculou) */
export function prazoManifestacaoAberto(lic: LicitacaoComPrazoManifestacao | null | undefined): boolean {
  if (!lic) return false
  if (typeof lic.prazo_manifestacao_aberto === 'boolean') {
    if (!lic.prazo_manifestacao_aberto) return false
    // a página pode ficar aberta além do limite: respeita o relógio local também
    const limite = lic.data_limite_impugnacao_efetiva ? new Date(lic.data_limite_impugnacao_efetiva) : null
    return !limite || isNaN(limite.getTime()) || new Date() <= limite
  }
  // Backend antigo (sem o campo): regra por fase
  return ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS'].includes(lic.fase || '')
}

/** Data-limite a exibir (efetiva do backend; senão a do edital). */
export function dataLimiteManifestacao(lic: LicitacaoComPrazoManifestacao | null | undefined): string | null {
  return lic?.data_limite_impugnacao_efetiva || lic?.data_limite_impugnacao || null
}
