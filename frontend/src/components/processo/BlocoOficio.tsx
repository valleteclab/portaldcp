"use client"

import { useEffect, useState } from "react"
import { chamarProcessos, textoDoErro, type ComQuemEsta, type Destinos } from "@/lib/processo/processo"
import { confirmarAcao } from "@/components/DialogoGlobal"
import { BlocoEnviar, FormularioPeca, estilos as s } from "./BlocosProcesso"

const DESPACHO_OFICIO = "Encaminho o ofício para conhecimento e providências."
const DESPACHO_RESPOSTA = "Encaminho a resposta ao ofício."

interface Rascunho {
  titulo: string | null
  html: string
  para_setor_id: string | null
  salvo_em: string
  salvo_por: string
}

const salvarRascunho = (processoId: string, dados: { titulo: string; html: string; para_setor_id: string | null }) =>
  chamarProcessos(`/${processoId}/rascunho`, { metodo: "PUT", corpo: dados, padrao: "Não foi possível salvar o rascunho." }).then(() => undefined)

/** "Como funciona" (mockup, tela Ofício 2): os três passos, com o atual em destaque. */
function ComoFunciona({ passo }: { passo: 1 | 2 | 3 }) {
  return (
    <aside className={s.bloco} style={{ margin: 0, flex: "1 1 240px", minWidth: 0 }} aria-label="Como funciona">
      <div className={s.eyebrow}>Como funciona</div>
      <ol style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {(["Escreva", "Assine", "Envie"] as const).map((t, i) => (
          <li key={t} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                background: i + 1 <= passo ? "var(--azul)" : "var(--linha)",
                color: i + 1 <= passo ? "var(--sobre-azul)" : "var(--tinta2)",
              }}
            >
              {i + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>
      <p className={s.texto} style={{ marginTop: 10 }}>
        Ofício é livre: não há fluxo desenhado. O número sai ao assinar, na sequência do seu setor, e substitui “[número do ofício]” no texto.
      </p>
    </aside>
  )
}

/**
 * ESCREVER E ENVIAR O OFÍCIO (mockup aprovado em 06/10/2026, tela Ofício 2):
 * para quem, modelo, texto (editor, IA ou arquivo feito fora), "Salvar
 * rascunho" (fica no processo, qualquer aparelho) e um botão só — assina,
 * numera na sequência do setor e envia.
 */
export function BlocoOficio({ processoId, onEnviado }: { processoId: string; onEnviado: () => void }) {
  const [destinos, setDestinos] = useState<Destinos | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho | null | undefined>(undefined)
  const [para, setPara] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    chamarProcessos<Destinos>(`/${processoId}/destinos`, { padrao: "Não foi possível carregar os setores." })
      .then((d) => vivo && setDestinos(d))
      .catch((e) => vivo && setErro(textoDoErro(e, "Não foi possível carregar os setores.")))
    chamarProcessos<{ rascunho: Rascunho | null }>(`/${processoId}/rascunho`)
      .then((r) => {
        if (!vivo) return
        setRascunho(r.rascunho)
        if (r.rascunho?.para_setor_id) setPara(r.rascunho.para_setor_id)
      })
      .catch(() => vivo && setRascunho(null))
    return () => {
      vivo = false
    }
  }, [processoId])

  const setor = destinos?.setores.find((x) => x.id === para) ?? null

  async function enviar() {
    setEnviando(true)
    setErro(null)
    try {
      await chamarProcessos(`/${processoId}/enviar`, {
        metodo: "POST",
        padrao: "O ofício foi assinado, mas não foi possível enviá-lo.",
        corpo: { para_setor_id: para, despacho: DESPACHO_OFICIO },
      })
    } catch (e) {
      // Assinado e juntado: o envio pode ser refeito pelo bloco de tramitação
      setErro(`${textoDoErro(e, "O ofício foi assinado, mas não foi possível enviá-lo.")} Use “Enviar” abaixo para tentar de novo.`)
    } finally {
      setEnviando(false)
      onEnviado()
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <section className={`${s.bloco} ${s.vez}`} style={{ margin: 0, flex: "999 1 560px", minWidth: 0 }} aria-labelledby="bloco-oficio">
        <div className={s.eyebrow} id="bloco-oficio">
          Ofício em elaboração
        </div>
        <h2>Escrever ofício</h2>
        <div className={s.formulario} style={{ marginTop: 8 }}>
          <label className={s.rotulo} htmlFor="oficio-para">
            Para
          </label>
          <select id="oficio-para" className={s.campo} value={para} onChange={(e) => setPara(e.target.value)} disabled={!destinos || enviando}>
            <option value="">{destinos ? "Escolha o setor de destino" : "Carregando setores..."}</option>
            {(destinos?.setores ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
          {rascunho ? (
            <p className={s.texto}>
              Rascunho salvo por {rascunho.salvo_por} em {new Date(rascunho.salvo_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.
            </p>
          ) : null}
          {erro ? (
            <div className={s.erro} role="alert">
              {erro}
            </div>
          ) : null}
        </div>
        {setor && rascunho !== undefined ? (
          <FormularioPeca
            processoId={processoId}
            etapa={null}
            tituloInicial={rascunho?.titulo || "Ofício"}
            tipoPeca="OFICIO"
            htmlInicial={rascunho?.html || null}
            rotuloBotao={enviando ? "Enviando..." : `Assinar e enviar para ${setor.nome}`}
            onSalvarRascunho={(d) => salvarRascunho(processoId, { ...d, para_setor_id: para || null })}
            onJuntada={enviar}
            onCancelar={() => setPara("")}
          />
        ) : null}
      </section>
      <ComoFunciona passo={1} />
    </div>
  )
}

/**
 * PROVIDÊNCIA (mockup aprovado, tela Ofício 3): o ofício está com o setor —
 * Responder (outro ofício, numerado, volta a quem enviou), Encaminhar a outro
 * setor ou Arquivar como atendido.
 */
export function BlocoProvidenciaOficio({
  processoId,
  remetente,
  posse,
  onFeito,
}: {
  processoId: string
  remetente: { setor_id: string | null; setor_nome: string | null } | null
  posse: ComQuemEsta | null
  onFeito: () => void
}) {
  const [modo, setModo] = useState<"responder" | "encaminhar" | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const [rascunho, setRascunho] = useState<Rascunho | null | undefined>(undefined)
  const podeResponder = !!remetente?.setor_id

  useEffect(() => {
    if (modo !== "responder") return
    let vivo = true
    chamarProcessos<{ rascunho: Rascunho | null }>(`/${processoId}/rascunho`)
      .then((r) => vivo && setRascunho(r.rascunho))
      .catch(() => vivo && setRascunho(null))
    return () => {
      vivo = false
    }
  }, [modo, processoId])

  async function devolverResposta() {
    setProcessando(true)
    setErro(null)
    try {
      await chamarProcessos(`/${processoId}/enviar`, {
        metodo: "POST",
        padrao: "A resposta foi assinada, mas não foi possível enviá-la.",
        corpo: { para_setor_id: remetente!.setor_id, despacho: DESPACHO_RESPOSTA },
      })
      onFeito()
    } catch (e) {
      setErro(`${textoDoErro(e, "A resposta foi assinada, mas não foi possível enviá-la.")} Use “Encaminhar a outro setor” para enviar.`)
      setModo(null)
    } finally {
      setProcessando(false)
    }
  }

  async function arquivar() {
    const ok = await confirmarAcao({ titulo: "Arquivar o ofício", mensagem: "Arquivar como atendido? O processo é encerrado e fica disponível para consulta.", confirmarRotulo: "Arquivar" })
    if (!ok) return
    setProcessando(true)
    setErro(null)
    try {
      await chamarProcessos(`/${processoId}/encerrar`, { metodo: "POST", corpo: { motivo: "Atendido" }, padrao: "Não foi possível arquivar." })
      onFeito()
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível arquivar."))
    } finally {
      setProcessando(false)
    }
  }

  const botao = (primario: boolean) => `${s.botao} ${primario ? s.primario : s.secundario}`

  return (
    <>
      <section className={`${s.bloco} ${s.vez}`} aria-labelledby="providencia-oficio">
        <div className={s.eyebrow} id="providencia-oficio">
          Aguardando providência do seu setor
        </div>
        <h2>Providência</h2>
        {erro ? (
          <div className={s.erro} role="alert" style={{ marginTop: 8 }}>
            {erro}
          </div>
        ) : null}
        {modo === null ? (
          <div className={s.acoes} style={{ marginTop: 10, flexDirection: "column", alignItems: "stretch" }}>
            <button type="button" className={botao(true)} onClick={() => setModo("responder")} disabled={!podeResponder || processando} title={podeResponder ? undefined : "Quem enviou não tem setor cadastrado: use Encaminhar"}>
              Responder{remetente?.setor_nome ? ` a ${remetente.setor_nome}` : ""}
            </button>
            <button type="button" className={botao(false)} onClick={() => setModo("encaminhar")} disabled={processando}>
              Encaminhar a outro setor
            </button>
            <button type="button" className={botao(false)} onClick={arquivar} disabled={processando}>
              {processando ? "Arquivando..." : "Arquivar — atendido"}
            </button>
          </div>
        ) : modo === "responder" && rascunho !== undefined ? (
          <FormularioPeca
            processoId={processoId}
            etapa={null}
            tituloInicial={rascunho?.titulo || "Ofício"}
            tipoPeca="OFICIO"
            htmlInicial={rascunho?.html || null}
            rotuloBotao={processando ? "Enviando..." : `Assinar e responder a ${remetente?.setor_nome ?? "quem enviou"}`}
            onSalvarRascunho={(d) => salvarRascunho(processoId, { ...d, para_setor_id: remetente?.setor_id ?? null })}
            onJuntada={devolverResposta}
            onCancelar={() => setModo(null)}
          />
        ) : modo === "encaminhar" ? (
          <div className={s.acoes} style={{ marginTop: 10 }}>
            <button type="button" className={botao(false)} onClick={() => setModo(null)}>
              Voltar
            </button>
          </div>
        ) : null}
      </section>
      {modo === "encaminhar" ? <BlocoEnviar processoId={processoId} etapaChave={null} posse={posse} ehAvulso podeEncerrar={false} onTramitou={onFeito} onEncerrou={onFeito} /> : null}
    </>
  )
}
