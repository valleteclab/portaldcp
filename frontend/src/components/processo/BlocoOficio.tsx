"use client"

import { useEffect, useState } from "react"
import { chamarProcessos, textoDoErro, type Destinos } from "@/lib/processo/processo"
import { FormularioPeca, estilos as s } from "./BlocosProcesso"

const DESPACHO_OFICIO = "Encaminho o ofício para conhecimento e providências."

/**
 * ESCREVER E ENVIAR O OFÍCIO (mockup aprovado em 06/10/2026): para quem,
 * texto (editor, IA ou arquivo feito fora) e um botão só — assina, numera
 * na sequência do setor e envia. Aparece enquanto o ofício ainda não foi
 * assinado; depois disso o processo segue como qualquer outro (receber,
 * responder, encaminhar, arquivar).
 */
export function BlocoOficio({ processoId, onEnviado }: { processoId: string; onEnviado: () => void }) {
  const [destinos, setDestinos] = useState<Destinos | null>(null)
  const [para, setPara] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    chamarProcessos<Destinos>(`/${processoId}/destinos`, { padrao: "Não foi possível carregar os setores." })
      .then((d) => vivo && setDestinos(d))
      .catch((e) => vivo && setErro(textoDoErro(e, "Não foi possível carregar os setores.")))
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
    <section className={`${s.bloco} ${s.vez}`} aria-labelledby="bloco-oficio">
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
        <p className={s.texto}>O número do ofício sai ao assinar, na sequência do seu setor, e substitui “[número do ofício]” no texto.</p>
        {erro ? (
          <div className={s.erro} role="alert">
            {erro}
          </div>
        ) : null}
      </div>
      {setor ? (
        <FormularioPeca
          key={setor.id}
          processoId={processoId}
          etapa={null}
          tituloInicial="Ofício"
          tipoPeca="OFICIO"
          rotuloBotao={enviando ? "Enviando..." : `Assinar e enviar para ${setor.nome}`}
          onJuntada={enviar}
          onCancelar={() => setPara("")}
        />
      ) : null}
    </section>
  )
}
