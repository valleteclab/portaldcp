"use client"

/**
 * PAINEL À DIREITA do construtor (modo Desenhar): edita o que está
 * selecionado — a caixa (nome, quem faz, prazo, o que produz, IA, aprovação
 * interna, parecer dispensável, a regra da condição), a seta (tipo) — ou,
 * sem seleção, as regras gerais do fluxo (aprovação da demanda e posse).
 */
import { useId, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ROTULO_OPCAO_ARESTA,
  ROTULO_OPERADOR,
  ROTULO_TIPO_CONTRATACAO,
  ROTULO_TIPO_NO,
  definirEtapaDoSistema,
  descreverCondicao,
  etapasUsadas,
  lerValorEmReais,
  responsavelDoValor,
  rotuloDoResponsavel,
  rotulosPermitidos,
  valorDoResponsavel,
  type CampoCondicao,
  type CondicaoNo,
  type GrafoFluxo,
  type NoFluxo,
  type RotuloAresta,
  type Selecao,
} from "@/lib/fluxo/grafo-editor"
import type { AprovacaoDemandaModelo, ModeloEmEdicao, TelaConstrutor } from "@/lib/fluxo/tela-construtor"
import { dispensaveisPorAto, exigidasPelaLei } from "@/lib/fluxo/tela-construtor"

const CAMPO = "h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
const ROTULO = "text-xs font-bold text-slate-700"
const TITULO = "text-[11px] font-bold uppercase tracking-wider text-slate-500"

export interface PainelCaixaProps {
  tela: TelaConstrutor
  modelo: ModeloEmEdicao
  sel: Selecao
  editavel: boolean
  onAlterarNo: (id: string, mudanca: Partial<NoFluxo>) => void
  onTrocarNo: (no: NoFluxo) => void
  onAlterarAresta: (id: string, rotulo: RotuloAresta) => void
  onApagar: () => void
  onLigar: (de: string, para: string) => void
  onAlterarModelo: (m: Partial<ModeloEmEdicao>) => void
}

export function PainelCaixa(p: PainelCaixaProps) {
  const g = p.modelo.grafo
  const sel = p.sel
  if (sel && "no" in sel) {
    const n = g.nos.find((x) => x.id === sel.no)
    if (n) return <EditorDaCaixa key={n.id} {...p} no={n} grafo={g} />
  }
  if (p.sel && "aresta" in p.sel) {
    const a = g.arestas.find((x) => x.id === (p.sel as { aresta: string }).aresta)
    if (a) {
      const de = g.nos.find((x) => x.id === a.de)
      const para = g.nos.find((x) => x.id === a.para)
      const opcoes = rotulosPermitidos(de?.tipo)
      const lista = opcoes.includes(a.rotulo) ? opcoes : [a.rotulo, ...opcoes]
      return (
        <div className="space-y-3">
          <p className={TITULO}>Ligação selecionada</p>
          <p className="text-sm text-slate-800">
            {de?.nome ?? "?"} → {para?.nome ?? "?"}
          </p>
          <div className="space-y-1">
            <label htmlFor="tipo-ligacao" className={ROTULO}>
              Tipo da ligação
            </label>
            <select id="tipo-ligacao" className={CAMPO} value={a.rotulo} disabled={!p.editavel} onChange={(e) => p.onAlterarAresta(a.id, e.target.value as RotuloAresta)}>
              {lista.map((r) => (
                <option key={r} value={r}>
                  {ROTULO_OPCAO_ARESTA[r]}
                </option>
              ))}
            </select>
            {de?.tipo === "condicao" && <p className="text-xs text-slate-600">A pergunta tem duas saídas: uma &quot;sim&quot; e uma &quot;não&quot;.</p>}
            {de?.tipo === "aprovacao" && (
              <p className="text-xs text-slate-600">&quot;Devolve&quot; leva o processo de volta para quem corrige; corrigido, ele volta direto para esta aprovação.</p>
            )}
          </div>
          {p.editavel && (
            <Button type="button" variant="outline" size="sm" onClick={p.onApagar}>
              <Trash2 aria-hidden="true" /> Apagar esta ligação
            </Button>
          )}
        </div>
      )
    }
  }
  return <RegrasDoFluxo {...p} />
}

// ---------------------------------------------------------------------------
// Caixa
// ---------------------------------------------------------------------------

function EditorDaCaixa(p: PainelCaixaProps & { no: NoFluxo; grafo: GrafoFluxo }) {
  const n = p.no
  const id = useId()
  const t = p.tela
  const d = !p.editavel
  const alterar = (m: Partial<NoFluxo>) => p.onAlterarNo(n.id, m)
  const deTrabalho = n.tipo === "etapa" || n.tipo === "aprovacao"
  const catalogo = t.catalogo.etapas
  const usadas = etapasUsadas(p.grafo, n.id, catalogo)
  const doCatalogo = !!n.codigo && catalogo.some((c) => c.codigo === n.codigo)
  const lei = exigidasPelaLei(t.requisitos)
  const podeDispensar = !!n.codigo && (dispensaveisPorAto(t.requisitos).has(n.codigo) || !!n.dispensavel_por_ato)
  const quem = valorDoResponsavel(n.responsavel)
  const destinos = p.grafo.nos.filter((x) => x.id !== n.id && x.tipo !== "inicio" && !p.grafo.arestas.some((a) => a.de === n.id && a.para === x.id))

  return (
    <div className="space-y-3">
      <p className={TITULO}>
        {ROTULO_TIPO_NO[n.tipo]} selecionada
        {n.codigo && lei.has(n.codigo) ? " · exigida por lei" : ""}
      </p>
      <div className="space-y-1">
        <label htmlFor={`${id}-nome`} className={ROTULO}>
          {n.tipo === "condicao" ? "Pergunta" : "Nome"}
        </label>
        <Input id={`${id}-nome`} value={n.nome} disabled={d} maxLength={120} onChange={(e) => alterar({ nome: e.target.value })} />
      </div>

      {deTrabalho && (
        <>
          <div className="space-y-1">
            <label htmlFor={`${id}-quem`} className={ROTULO}>
              {n.tipo === "aprovacao" ? "Quem aprova" : "Quem faz"}
            </label>
            <select
              id={`${id}-quem`}
              className={`${CAMPO} ${quem === "" && !doCatalogo ? "border-red-400" : ""}`}
              value={quem}
              disabled={d}
              onChange={(e) => alterar({ responsavel: responsavelDoValor(e.target.value, n.responsavel) })}
            >
              <option value="">— escolha —</option>
              {quem === "combinado" && <option value="combinado">{rotuloDoResponsavel(n.responsavel, t)} (como está)</option>}
              <optgroup label="Setor">
                {t.setores.map((s) => (
                  <option key={s.id} value={`setor:${s.id}`}>
                    {s.nome}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Papel">
                {t.papeis.map((x) => (
                  <option key={x.codigo} value={`papel:${x.codigo}`}>
                    {x.rotulo}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Pessoa">
                {t.usuarios.map((u) => (
                  <option key={u.id} value={`usuario:${u.id}`}>
                    {u.nome}
                  </option>
                ))}
              </optgroup>
            </select>
            {quem === "" && !doCatalogo && <p className="text-xs text-red-700">Escolha quem faz para poder ativar.</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor={`${id}-prazo`} className={ROTULO}>
              Prazo (dias úteis)
            </label>
            <Input
              id={`${id}-prazo`}
              type="number"
              min={0}
              max={365}
              className="w-28"
              value={n.prazo_dias_uteis ?? ""}
              disabled={d}
              onChange={(e) => alterar({ prazo_dias_uteis: e.target.value === "" ? null : Math.max(0, Math.min(365, Math.floor(Number(e.target.value) || 0))) })}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={`${id}-produz`} className={ROTULO}>
              Peças que produz
            </label>
            <select
              id={`${id}-produz`}
              className={CAMPO}
              value={doCatalogo ? n.codigo : ""}
              disabled={d}
              onChange={(e) => p.onTrocarNo(definirEtapaDoSistema(n, e.target.value || null, catalogo))}
            >
              <option value="">Nenhuma — conclui com um despacho</option>
              {catalogo.map((c) => (
                <option key={c.codigo} value={c.codigo} disabled={usadas.has(c.codigo)}>
                  {c.titulo}
                  {c.pecas.length ? ` (${c.pecas.join(", ")})` : ""}
                  {usadas.has(c.codigo) ? " — já está em outra caixa" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-600">
              {doCatalogo
                ? "A tela da etapa, as travas da lei e o fundamento vêm junto."
                : "Etapa do órgão: quem faz conclui com um despacho curto, que vai aos autos."}
            </p>
          </div>

          <fieldset className="space-y-1.5" disabled={d}>
            <legend className="sr-only">Opções da etapa</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={!!n.ia_rascunho} onChange={(e) => alterar({ ia_rascunho: e.target.checked })} />
              <span>IA prepara o rascunho</span>
            </label>
            {doCatalogo && (n.pecas ?? []).length > 0 && (
              <label className="flex items-start gap-2 text-sm" title="A peça feita no sistema só conta depois de aprovada no fluxo de aprovação do órgão ou assinada">
                <input type="checkbox" className="mt-1" checked={!!n.aprovacao_interna} onChange={(e) => alterar({ aprovacao_interna: e.target.checked })} />
                <span>Aprovação interna da peça</span>
              </label>
            )}
            {podeDispensar && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={!!n.dispensavel_por_ato} onChange={(e) => alterar({ dispensavel_por_ato: e.target.checked })} />
                <span>Parecer dispensável por ato do jurídico (art. 53, §5º)</span>
              </label>
            )}
          </fieldset>

          {n.tipo === "aprovacao" && (
            <p className="text-xs text-slate-600">
              Para &quot;devolver&quot;, ligue uma seta desta aprovação até a caixa que corrige (ela vira &quot;devolve&quot;). Sem essa seta, devolve para a
              etapa anterior.
            </p>
          )}
        </>
      )}

      {n.tipo === "condicao" && <EditorDaCondicao {...p} no={n} />}

      {p.editavel && n.tipo !== "fim" && destinos.length > 0 && (
        <div className="space-y-1">
          <label htmlFor={`${id}-ligar`} className={ROTULO}>
            Ligar a
          </label>
          <select
            id={`${id}-ligar`}
            className={CAMPO}
            value=""
            onChange={(e) => {
              if (e.target.value) p.onLigar(n.id, e.target.value)
            }}
          >
            <option value="">— escolha a próxima caixa —</option>
            {destinos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-600">Ou puxe a bolinha azul da caixa até a outra.</p>
        </div>
      )}

      {p.editavel && n.tipo !== "inicio" && (
        <Button type="button" variant="outline" size="sm" onClick={p.onApagar}>
          <Trash2 aria-hidden="true" /> Apagar esta caixa
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Condição
// ---------------------------------------------------------------------------

function EditorDaCondicao(p: PainelCaixaProps & { no: NoFluxo }) {
  const n = p.no
  const id = useId()
  const d = !p.editavel
  const c: CondicaoNo = n.condicao ?? { campo: "manual" }
  const campos = p.tela.catalogo.campos_condicao
  const campo = campos.find((x) => x.campo === c.campo)
  const definir = (nova: CondicaoNo) => p.onAlterarNo(n.id, { condicao: nova })
  // O valor em R$ fica como a pessoa digita; o número vai para a condição
  const [valorTexto, setValorTexto] = useState(c.valor != null && c.campo === "valor_total_estimado" ? String(c.valor).replace(".", ",") : "")
  const [ateTexto, setAteTexto] = useState(c.valor_ate != null ? String(c.valor_ate).replace(".", ",") : "")

  const trocarCampo = (novo: CampoCondicao) => {
    const cfg = campos.find((x) => x.campo === novo)
    if (novo === "manual" || !cfg) return definir({ campo: "manual" })
    setValorTexto("")
    setAteTexto("")
    definir({ campo: novo, operador: cfg.operadores[0] ?? null, valor: null, ...(novo === "tipo_contratacao" ? { valor: cfg.opcoes?.[0] ?? null } : {}) })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${id}-campo`} className={ROTULO}>
          Quem responde
        </label>
        <select id={`${id}-campo`} className={CAMPO} value={c.campo} disabled={d} onChange={(e) => trocarCampo(e.target.value as CampoCondicao)}>
          {campos.map((x) => (
            <option key={x.campo} value={x.campo}>
              {x.campo === "manual" ? "Manual — quem conduz responde" : `O sistema, pelo ${x.rotulo.charAt(0).toLowerCase()}${x.rotulo.slice(1)}`}
            </option>
          ))}
        </select>
      </div>

      {campo && campo.campo !== "manual" && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="space-y-1">
            <label htmlFor={`${id}-op`} className={ROTULO}>
              Condição
            </label>
            <select
              id={`${id}-op`}
              className={CAMPO}
              value={String(c.operador ?? campo.operadores[0])}
              disabled={d}
              onChange={(e) => {
                const op = e.target.value
                if (op === "em") definir({ ...c, operador: op, valores: c.valor ? [String(c.valor)] : [], valor: null })
                else definir({ ...c, operador: op, valor: c.valor ?? (c.valores?.[0] ?? null), valores: null })
              }}
            >
              {campo.operadores.map((o) => (
                <option key={o} value={o}>
                  {ROTULO_OPERADOR[o] ?? o}
                </option>
              ))}
            </select>
          </div>

          {campo.valor === "numero" && (
            <div className="flex flex-wrap gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor={`${id}-valor`} className={ROTULO}>
                  Valor (R$)
                </label>
                <Input
                  id={`${id}-valor`}
                  inputMode="decimal"
                  placeholder="50.000,00"
                  value={valorTexto}
                  disabled={d}
                  onChange={(e) => {
                    setValorTexto(e.target.value)
                    definir({ ...c, valor: lerValorEmReais(e.target.value) })
                  }}
                />
              </div>
              {c.operador === "entre" && (
                <div className="min-w-0 flex-1 space-y-1">
                  <label htmlFor={`${id}-ate`} className={ROTULO}>
                    Até (R$)
                  </label>
                  <Input
                    id={`${id}-ate`}
                    inputMode="decimal"
                    value={ateTexto}
                    disabled={d}
                    onChange={(e) => {
                      setAteTexto(e.target.value)
                      definir({ ...c, valor_ate: lerValorEmReais(e.target.value) })
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {campo.valor === "opcao" && c.operador !== "em" && (
            <div className="space-y-1">
              <label htmlFor={`${id}-opcao`} className={ROTULO}>
                Valor
              </label>
              <select id={`${id}-opcao`} className={CAMPO} value={String(c.valor ?? "")} disabled={d} onChange={(e) => definir({ ...c, valor: e.target.value })}>
                {(campo.opcoes ?? []).map((o) => (
                  <option key={o} value={o}>
                    {ROTULO_TIPO_CONTRATACAO[o] ?? o}
                  </option>
                ))}
              </select>
            </div>
          )}

          {campo.valor === "opcao" && c.operador === "em" && (
            <fieldset className="grid grid-cols-2 gap-1" disabled={d}>
              <legend className={ROTULO}>Valores</legend>
              {(campo.opcoes ?? []).map((o) => (
                <label key={o} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={(c.valores ?? []).includes(o)}
                    onChange={(e) => definir({ ...c, valores: e.target.checked ? [...(c.valores ?? []), o] : (c.valores ?? []).filter((x) => x !== o) })}
                  />
                  {ROTULO_TIPO_CONTRATACAO[o] ?? o}
                </label>
              ))}
            </fieldset>
          )}

          {campo.valor === "texto" && (
            <div className="space-y-1">
              <label htmlFor={`${id}-texto`} className={ROTULO}>
                {c.operador === "em" ? "Valores (separados por vírgula)" : "Texto"}
              </label>
              <Input
                id={`${id}-texto`}
                value={c.operador === "em" ? (c.valores ?? []).join(", ") : String(c.valor ?? "")}
                placeholder={c.campo === "fundamento_legal" ? "Ex.: art. 75, II" : "Ex.: PREGAO"}
                disabled={d}
                onChange={(e) =>
                  definir(
                    c.operador === "em"
                      ? { ...c, valores: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }
                      : { ...c, valor: e.target.value },
                  )
                }
              />
            </div>
          )}
          <p className="text-xs text-slate-700">Sim quando: {descreverCondicao(c)}.</p>
        </div>
      )}
      <p className="text-xs text-slate-600">
        {c.campo === "manual"
          ? "Quando o processo chegar aqui, quem conduz responde sim ou não no quadro do processo."
          : "O sistema responde quando o processo chega aqui, com os dados do processo. Sem o dado ainda (ex.: sem valor estimado), quem conduz responde."}{" "}
        Ligue uma saída &quot;sim&quot; e uma &quot;não&quot;.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sem seleção: regras do fluxo
// ---------------------------------------------------------------------------

function RegrasDoFluxo(p: PainelCaixaProps) {
  const id = useId()
  const d = !p.editavel
  const t = p.tela
  const ap = p.modelo.aprovacao_demanda
  const alterarAprovacao = (m: Partial<AprovacaoDemandaModelo>) => p.onAlterarModelo({ aprovacao_demanda: { ...ap, ...m } })
  const opcoes =
    ap.aprovador.tipo === "PAPEL"
      ? t.papeis.map((x) => ({ id: x.codigo, nome: x.rotulo }))
      : ap.aprovador.tipo === "SETOR"
        ? t.setores
        : ap.aprovador.tipo === "USUARIO"
          ? t.usuarios
          : []
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">Clique numa caixa ou numa seta para editar. Tecla Delete apaga o que está selecionado.</p>
      <details className="rounded-md border border-slate-200 p-2">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Regras do fluxo</summary>
        <fieldset className="mt-2 space-y-3" disabled={d}>
          <div className="space-y-1">
            <label htmlFor={`${id}-nome`} className={ROTULO}>
              Nome do fluxo
            </label>
            <Input id={`${id}-nome`} value={p.modelo.nome} maxLength={120} onChange={(e) => p.onAlterarModelo({ nome: e.target.value })} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={ap.exigida} onChange={(e) => alterarAprovacao({ exigida: e.target.checked })} />
            <span>
              <b>Exigir a aprovação da demanda</b> antes das demais etapas
            </span>
          </label>
          {ap.exigida && (
            <div className="space-y-2 pl-6">
              <div className="space-y-1">
                <label htmlFor={`${id}-aprovador`} className={ROTULO}>
                  Quem aprova
                </label>
                <select
                  id={`${id}-aprovador`}
                  className={CAMPO}
                  value={ap.aprovador.tipo}
                  onChange={(e) => alterarAprovacao({ aprovador: { tipo: e.target.value as AprovacaoDemandaModelo["aprovador"]["tipo"], valor: null } })}
                >
                  <option value="PERMISSAO">Quem tem a permissão &quot;aprovar demandas&quot;</option>
                  <option value="PAPEL">Um papel</option>
                  <option value="SETOR">Um setor</option>
                  <option value="USUARIO">Uma pessoa</option>
                </select>
                {opcoes.length > 0 && (
                  <select
                    aria-label="Aprovador"
                    className={CAMPO}
                    value={ap.aprovador.valor ?? ""}
                    onChange={(e) => alterarAprovacao({ aprovador: { ...ap.aprovador, valor: e.target.value || null } })}
                  >
                    <option value="">— escolha —</option>
                    {opcoes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={ap.aceita_peca_externa} onChange={(e) => alterarAprovacao({ aceita_peca_externa: e.target.checked })} />
                <span>DFD feita fora (assinada no papel) já traz a aprovação</span>
              </label>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={p.modelo.exigir_posse_pecas} onChange={(e) => p.onAlterarModelo({ exigir_posse_pecas: e.target.checked })} />
            <span>
              <b>Exigir a posse para trabalhar nas peças</b> (modo por setor): só quem está com o processo mexe nas peças da própria etapa.
            </span>
          </label>
        </fieldset>
      </details>
    </div>
  )
}
