"use client"

/**
 * Campos próprios de leilão, concurso e diálogo competitivo no ASSISTENTE de
 * criação do processo (plano E7c). São gravados logo depois da criação pelas
 * rotas de cada modalidade; o que faltar aparece como pendência no painel da
 * modalidade no cockpit (e bloqueia a publicação do edital).
 */
import { API_URL, authFetch } from "@/lib/api"
import { FormConfiguracaoDialogo, FormConfiguracaoLeilao, FormRegulamentoConcurso, type Valores } from "./formularios"

const ROTAS: Record<string, string> = {
  Leilão: "leilao/licitacao/:id/configuracao",
  Concurso: "concurso/licitacao/:id/regulamento",
  "Diálogo Competitivo": "dialogo-competitivo/licitacao/:id/configuracao",
}

export const MODALIDADES_ESPECIAIS_WIZARD = Object.keys(ROTAS)

export function CamposModalidadeEspecial({ modalidade, valor, onChange }: { modalidade: string; valor: Valores; onChange: (v: Valores) => void }) {
  if (!ROTAS[modalidade]) return null
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {modalidade === "Leilão" && (
        <>
          <p className="text-xs text-slate-600">
            <b>Leilão (art. 31):</b> maior lance, sem habilitação; edital com os bens, avaliação e preço mínimo (cadastrados por item no cockpit),
            condições de pagamento e quem conduz. Divulgação mínima de 15 dias úteis (art. 55 III).
          </p>
          <FormConfiguracaoLeilao valor={valor} onChange={onChange} />
        </>
      )}
      {modalidade === "Concurso" && (
        <>
          <p className="text-xs text-slate-600">
            <b>Concurso (art. 30):</b> um único item (o prêmio/remuneração), banca de no mínimo 3 membros, trabalhos julgados sob código
            (sigilo de autoria) e divulgação mínima de 35 dias úteis (art. 55 IV).
          </p>
          <FormRegulamentoConcurso valor={valor} onChange={onChange} />
        </>
      )}
      {modalidade === "Diálogo Competitivo" && (
        <>
          <p className="text-xs text-slate-600">
            <b>Diálogo competitivo (art. 32):</b> manifestação de interesse em no mínimo 25 dias úteis, pré-seleção objetiva, reuniões registradas
            e gravadas, e fase competitiva com no mínimo 60 dias úteis.
          </p>
          <FormConfiguracaoDialogo valor={valor} onChange={onChange} />
        </>
      )}
    </div>
  )
}

/** Grava os campos próprios depois da criação do processo. Devolve a mensagem de erro (pendências) ou null. */
export async function salvarCamposModalidadeEspecial(licitacaoId: string, modalidade: string, valor: Valores | null | undefined): Promise<string | null> {
  const rota = ROTAS[modalidade]
  if (!rota || !valor || !Object.keys(valor).length) return null
  const r = await authFetch(`${API_URL}/api/${rota.replace(":id", licitacaoId)}`, { method: "PUT", body: JSON.stringify(valor) })
  if (r.ok) return null
  const j = await r.json().catch(() => ({}))
  return Array.isArray(j?.pendencias) ? j.pendencias.join(" | ") : String(j?.message ?? `HTTP ${r.status}`)
}
