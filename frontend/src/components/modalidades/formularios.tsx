"use client"

/**
 * Formulários (controlados) dos dados PRÓPRIOS de cada modalidade especial —
 * usados no assistente de criação do processo e nos painéis do cockpit.
 * Base legal no rótulo de cada campo; a validação é do backend.
 */
import { Campo, classeInput } from "./comum"

export type Valores = Record<string, any>

// ---------------------------------------------------------------------------
// LEILÃO — art. 31 caput, §1º e §2º II a IV
// ---------------------------------------------------------------------------

export function FormConfiguracaoLeilao({ valor, onChange }: { valor: Valores; onChange: (v: Valores) => void }) {
  const set = (k: string, v: any) => onChange({ ...valor, [k]: v })
  const oficial = valor.tipo_leiloeiro === "OFICIAL"
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Campo rotulo="Quem conduz o leilão" dica="Art. 31, caput: leiloeiro oficial ou servidor designado pela autoridade competente">
        <select className={classeInput} value={valor.tipo_leiloeiro ?? "SERVIDOR"} onChange={(e) => set("tipo_leiloeiro", e.target.value)}>
          <option value="SERVIDOR">Servidor designado</option>
          <option value="OFICIAL">Leiloeiro oficial</option>
        </select>
      </Campo>
      {!oficial ? (
        <>
          <Campo rotulo="Servidor designado">
            <input className={classeInput} value={valor.servidor_nome ?? ""} onChange={(e) => set("servidor_nome", e.target.value)} />
          </Campo>
          <Campo rotulo="Ato de designação (portaria nº/data)">
            <input className={classeInput} value={valor.ato_designacao ?? ""} onChange={(e) => set("ato_designacao", e.target.value)} />
          </Campo>
        </>
      ) : (
        <>
          <Campo rotulo="Leiloeiro oficial">
            <input className={classeInput} value={valor.leiloeiro_nome ?? ""} onChange={(e) => set("leiloeiro_nome", e.target.value)} />
          </Campo>
          <Campo rotulo="CPF do leiloeiro">
            <input className={classeInput} value={valor.leiloeiro_cpf ?? ""} onChange={(e) => set("leiloeiro_cpf", e.target.value)} />
          </Campo>
          <Campo rotulo="Matrícula na Junta Comercial">
            <input className={classeInput} value={valor.leiloeiro_matricula ?? ""} onChange={(e) => set("leiloeiro_matricula", e.target.value)} />
          </Campo>
          <Campo rotulo="Comissão (% sobre o arrematado)" dica="Paga pelo arrematante (art. 31 §2º II); referência federal: até 5% (Decreto 11.461/2023)">
            <input type="number" step="0.01" className={classeInput} value={valor.comissao_percentual ?? ""} onChange={(e) => set("comissao_percentual", e.target.value === "" ? null : Number(e.target.value))} />
          </Campo>
          <Campo rotulo="Como foi selecionado" dica="Art. 31 §1º: credenciamento ou pregão, com maior desconto na comissão">
            <select className={classeInput} value={valor.leiloeiro_forma_selecao ?? ""} onChange={(e) => set("leiloeiro_forma_selecao", e.target.value)}>
              <option value="">Selecione…</option>
              <option value="CREDENCIAMENTO">Credenciamento</option>
              <option value="PREGAO">Pregão</option>
            </select>
          </Campo>
          <Campo rotulo="Processo de seleção do leiloeiro">
            <input className={classeInput} value={valor.leiloeiro_processo_selecao ?? ""} onChange={(e) => set("leiloeiro_processo_selecao", e.target.value)} />
          </Campo>
        </>
      )}
      <Campo rotulo="Forma de pagamento" dica="Art. 31 §2º II e §4º">
        <select className={classeInput} value={valor.forma_pagamento ?? "A_VISTA"} onChange={(e) => set("forma_pagamento", e.target.value)}>
          <option value="A_VISTA">À vista</option>
          <option value="PARCELADO">Parcelado (conforme edital)</option>
        </select>
      </Campo>
      <Campo rotulo="Prazo para pagar (dias úteis)" dica="Contado da convocação, no calendário do órgão">
        <input type="number" min={1} max={30} className={classeInput} value={valor.prazo_pagamento_dias_uteis ?? 1} onChange={(e) => set("prazo_pagamento_dias_uteis", Number(e.target.value))} />
      </Campo>
      {valor.forma_pagamento === "PARCELADO" && (
        <Campo rotulo="Parcelas">
          <input type="number" min={2} className={classeInput} value={valor.parcelas ?? ""} onChange={(e) => set("parcelas", Number(e.target.value))} />
        </Campo>
      )}
      <Campo rotulo="Condições de pagamento (texto do edital)">
        <input className={classeInput} value={valor.condicoes_pagamento ?? ""} onChange={(e) => set("condicoes_pagamento", e.target.value)} />
      </Campo>
      <Campo rotulo="Local de visitação" dica="Art. 31 §2º III">
        <input className={classeInput} value={valor.local_visitacao ?? ""} onChange={(e) => set("local_visitacao", e.target.value)} />
      </Campo>
      <Campo rotulo="Período de visitação">
        <input className={classeInput} value={valor.periodo_visitacao ?? ""} onChange={(e) => set("periodo_visitacao", e.target.value)} />
      </Campo>
    </div>
  )
}

export function FormBemLeilao({ valor, onChange }: { valor: Valores; onChange: (v: Valores) => void }) {
  const set = (k: string, v: any) => onChange({ ...valor, [k]: v })
  const imovel = valor.tipo_bem === "IMOVEL"
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Campo rotulo="Tipo do bem">
        <select className={classeInput} value={valor.tipo_bem ?? "MOVEL"} onChange={(e) => set("tipo_bem", e.target.value)}>
          <option value="MOVEL">Bem móvel</option>
          <option value="VEICULO">Veículo</option>
          <option value="SEMOVENTE">Semovente</option>
          <option value="IMOVEL">Imóvel</option>
        </select>
      </Campo>
      <Campo rotulo="Valor da avaliação (R$)" dica="Art. 31 §2º II; art. 76 (avaliação prévia)">
        <input type="number" step="0.01" className={classeInput} value={valor.valor_avaliacao ?? ""} onChange={(e) => set("valor_avaliacao", e.target.value === "" ? null : Number(e.target.value))} />
      </Campo>
      <Campo rotulo="Preço mínimo de arrematação (R$)" dica="Nenhum lance abaixo dele (art. 31 §2º II)">
        <input type="number" step="0.01" className={classeInput} value={valor.valor_minimo ?? ""} onChange={(e) => set("valor_minimo", e.target.value === "" ? null : Number(e.target.value))} />
      </Campo>
      <div className="md:col-span-3">
        <Campo rotulo="Descrição e características" dica="Art. 31 §2º I">
          <textarea rows={2} className={classeInput} value={valor.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Data da avaliação">
        <input type="date" className={classeInput} value={valor.data_avaliacao ?? ""} onChange={(e) => set("data_avaliacao", e.target.value)} />
      </Campo>
      <Campo rotulo="Responsável/laudo da avaliação">
        <input className={classeInput} value={valor.avaliacao_responsavel ?? ""} onChange={(e) => set("avaliacao_responsavel", e.target.value)} />
      </Campo>
      <Campo rotulo="Ônus, gravames ou pendências" dica="Art. 31 §2º V">
        <input className={classeInput} value={valor.onus_gravames ?? ""} onChange={(e) => set("onus_gravames", e.target.value)} />
      </Campo>
      {imovel ? (
        <>
          <Campo rotulo="Matrícula e registros" dica="Art. 31 §2º I">
            <input className={classeInput} value={valor.matricula_imovel ?? ""} onChange={(e) => set("matricula_imovel", e.target.value)} />
          </Campo>
          <Campo rotulo="Situação e divisas">
            <input className={classeInput} value={valor.situacao_divisas ?? ""} onChange={(e) => set("situacao_divisas", e.target.value)} />
          </Campo>
          <Campo rotulo="Autorização legislativa (lei nº)" dica="Art. 76, I">
            <input className={classeInput} value={valor.autorizacao_legislativa ?? ""} onChange={(e) => set("autorizacao_legislativa", e.target.value)} />
          </Campo>
        </>
      ) : (
        <>
          <Campo rotulo="Onde está o bem" dica="Art. 31 §2º III">
            <input className={classeInput} value={valor.localizacao ?? ""} onChange={(e) => set("localizacao", e.target.value)} />
          </Campo>
          <Campo rotulo="Visitação">
            <input className={classeInput} value={valor.visitacao ?? ""} onChange={(e) => set("visitacao", e.target.value)} />
          </Campo>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CONCURSO — art. 30 I a III e parágrafo único
// ---------------------------------------------------------------------------

export function FormRegulamentoConcurso({ valor, onChange }: { valor: Valores; onChange: (v: Valores) => void }) {
  const set = (k: string, v: any) => onChange({ ...valor, [k]: v })
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Campo rotulo="Natureza do trabalho" dica="Art. 6º XXXIX — artístico é julgado por conteúdo artístico">
        <select className={classeInput} value={valor.natureza_trabalho ?? "TECNICO"} onChange={(e) => set("natureza_trabalho", e.target.value)}>
          <option value="TECNICO">Técnico</option>
          <option value="CIENTIFICO">Científico</option>
          <option value="ARTISTICO">Artístico</option>
        </select>
      </Campo>
      <Campo rotulo="Retribuição" dica="Art. 30 III">
        <select className={classeInput} value={valor.tipo_retribuicao ?? "PREMIO"} onChange={(e) => set("tipo_retribuicao", e.target.value)}>
          <option value="PREMIO">Prêmio</option>
          <option value="REMUNERACAO">Remuneração</option>
        </select>
      </Campo>
      <Campo rotulo="Valor do prêmio/remuneração (R$)">
        <input type="number" step="0.01" className={classeInput} value={valor.valor_premio ?? ""} onChange={(e) => set("valor_premio", e.target.value === "" ? null : Number(e.target.value))} />
      </Campo>
      <Campo rotulo="Descrição do prêmio">
        <input className={classeInput} value={valor.descricao_premio ?? ""} onChange={(e) => set("descricao_premio", e.target.value)} />
      </Campo>
      <div className="md:col-span-2">
        <Campo rotulo="Qualificação exigida dos participantes" dica="Art. 30 I — conferida no envelope de identificação do vencedor">
          <textarea rows={2} className={classeInput} value={valor.qualificacao_exigida ?? ""} onChange={(e) => set("qualificacao_exigida", e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Diretrizes do trabalho" dica="Art. 30 II">
        <textarea rows={2} className={classeInput} value={valor.diretrizes_trabalho ?? ""} onChange={(e) => set("diretrizes_trabalho", e.target.value)} />
      </Campo>
      <Campo rotulo="Formas de apresentação" dica="Art. 30 II — sem identificação do autor">
        <textarea rows={2} className={classeInput} value={valor.forma_apresentacao ?? ""} onChange={(e) => set("forma_apresentacao", e.target.value)} />
      </Campo>
      <div className="md:col-span-2">
        <Campo rotulo="Condições de realização" dica="Art. 30 III">
          <textarea rows={2} className={classeInput} value={valor.condicoes_realizacao ?? ""} onChange={(e) => set("condicoes_realizacao", e.target.value)} />
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!valor.elaboracao_projeto} onChange={(e) => onChange({ ...valor, elaboracao_projeto: e.target.checked, ...(e.target.checked ? { exige_cessao_direitos: true } : {}) })} />
        Concurso para elaboração de projeto (art. 30, parágrafo único)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={valor.exige_cessao_direitos !== false} disabled={!!valor.elaboracao_projeto} onChange={(e) => set("exige_cessao_direitos", e.target.checked)} />
        Exige cessão dos direitos patrimoniais do vencedor (art. 93)
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DIÁLOGO COMPETITIVO — art. 32 caput e §1º I e II
// ---------------------------------------------------------------------------

export const HIPOTESES_DIALOGO: Array<[string, string]> = [
  ["I_A", "I, a — inovação tecnológica ou técnica"],
  ["I_B", "I, b — necessidade não satisfeita sem adaptar soluções do mercado"],
  ["I_C", "I, c — especificações técnicas não definíveis com precisão"],
  ["II_A", "II, a — definir a solução técnica mais adequada"],
  ["II_B", "II, b — definir os requisitos técnicos da solução"],
  ["II_C", "II, c — definir a estrutura jurídica ou financeira do contrato"],
]

export function FormConfiguracaoDialogo({ valor, onChange }: { valor: Valores; onChange: (v: Valores) => void }) {
  const set = (k: string, v: any) => onChange({ ...valor, [k]: v })
  const hip: string[] = valor.hipoteses ?? []
  const criterios: Array<{ id?: string; descricao: string }> = valor.criterios_preselecao ?? []
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-700">Hipótese legal (art. 32)</p>
        <p className="text-[11px] text-slate-400">No inciso I, as três condições (a, b e c) são exigidas.</p>
        <div className="mt-1 grid gap-1 md:grid-cols-2">
          {HIPOTESES_DIALOGO.map(([k, rot]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hip.includes(k)} onChange={(e) => set("hipoteses", e.target.checked ? [...hip, k] : hip.filter((x) => x !== k))} />
              {rot}
            </label>
          ))}
        </div>
      </div>
      <Campo rotulo="Justificativa do enquadramento">
        <textarea rows={2} className={classeInput} value={valor.justificativa_hipotese ?? ""} onChange={(e) => set("justificativa_hipotese", e.target.value)} />
      </Campo>
      <Campo rotulo="Necessidades da Administração" dica="Art. 32 §1º I">
        <textarea rows={3} className={classeInput} value={valor.necessidades ?? ""} onChange={(e) => set("necessidades", e.target.value)} />
      </Campo>
      <Campo rotulo="Exigências já definidas" dica="Art. 32 §1º I">
        <textarea rows={2} className={classeInput} value={valor.exigencias_definidas ?? ""} onChange={(e) => set("exigencias_definidas", e.target.value)} />
      </Campo>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">Critérios objetivos de pré-seleção (art. 32 §1º II)</p>
        {criterios.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={classeInput}
              value={c.descricao}
              onChange={(e) => set("criterios_preselecao", criterios.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
            />
            <button type="button" className="text-xs text-red-600" onClick={() => set("criterios_preselecao", criterios.filter((_, j) => j !== i))}>
              remover
            </button>
          </div>
        ))}
        <button type="button" className="text-xs text-blue-700" onClick={() => set("criterios_preselecao", [...criterios, { descricao: "" }])}>
          + critério
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!valor.fases_sucessivas} onChange={(e) => set("fases_sucessivas", e.target.checked)} />
        Prever fases sucessivas de diálogo (art. 32 §1º VII)
      </label>
    </div>
  )
}
