"use client"

import { useEffect, useState } from "react"
import { chamarProcessos, temLacuna, textoDoErro, type PecaLicitacaoEditor, type RascunhoPecaLicitacao } from "@/lib/processo/processo"
import { EditorPeca } from "./EditorPeca"
import s from "./processo.module.css"

const DICA = "Clique em cada lacuna laranja e escreva no lugar: a marca some sozinha."

/**
 * Autorização, parecer e manifestação do controle interno escritos no editor
 * novo (modelo, IA, lacunas) e gravados pela fase interna: a autorização vai
 * para a assinatura da autoridade; parecer e manifestação são emitidos e
 * assinados por quem tem o papel.
 */
export function FormularioPecaLicitacao({ processoId, tipo, onFeito, onCancelar }: { processoId: string; tipo: string; onFeito: (mensagem: string) => void; onCancelar: () => void }) {
  const [peca, setPeca] = useState<PecaLicitacaoEditor | null>(null)
  const [html, setHtml] = useState("")
  const [extra, setExtra] = useState("")
  const [conclusao, setConclusao] = useState("")
  const [aviso, setAviso] = useState<string | null>(null)
  const [iaModelo, setIaModelo] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    chamarProcessos<PecaLicitacaoEditor>(`/${processoId}/pecas-licitacao/${tipo}`, { padrao: "Não foi possível carregar a peça." })
      .then((p) => {
        if (!vivo) return
        setPeca(p)
        setHtml(p.html)
        setAviso(p.html ? `Modelo do órgão. ${DICA}` : "Escreva a peça.")
      })
      .catch((e) => vivo && setErro(textoDoErro(e, "Não foi possível carregar a peça.")))
    return () => {
      vivo = false
    }
  }, [processoId, tipo])

  async function gerarRascunho() {
    setErro(null)
    setGerando(true)
    try {
      const r = await chamarProcessos<RascunhoPecaLicitacao>(`/${processoId}/pecas-licitacao/${tipo}/rascunho`, { metodo: "POST", padrao: "A IA não conseguiu escrever o rascunho." })
      setHtml(r.html)
      if (r.extra) setExtra(r.extra)
      setIaModelo(r.ia_modelo)
      setAviso(`A IA usou o processo (itens, reserva, DFD/ETP/TR).${r.conclusao_sugerida ? ` Conclusão sugerida: ${r.conclusao_sugerida}.` : ""} Revise antes de emitir.`)
    } catch (e) {
      setErro(textoDoErro(e, "A IA não conseguiu escrever o rascunho."))
    } finally {
      setGerando(false)
    }
  }

  async function emitir() {
    setErro(null)
    if (!html.replace(/<[^>]+>|&nbsp;/g, "").trim()) return setErro("Escreva o texto da peça.")
    if (temLacuna(html)) return setErro(`Ainda há lacunas em laranja. ${DICA}`)
    if (peca?.conclusoes && !conclusao) return setErro("Escolha a conclusão.")
    setEnviando(true)
    try {
      const r = await chamarProcessos<{ ok: boolean; mensagem: string }>(`/${processoId}/pecas-licitacao/${tipo}`, {
        metodo: "POST",
        padrao: "Não foi possível emitir a peça.",
        corpo: { texto_html: html, conclusao: conclusao || undefined, [peca?.extra?.id ?? "extra"]: extra.trim() || undefined, ia_modelo: iaModelo ?? undefined },
      })
      onFeito(r.mensagem)
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível emitir a peça."))
    } finally {
      setEnviando(false)
    }
  }

  if (!peca && !erro) return <div className={s.ou}>Carregando a peça…</div>

  return (
    <div className={s.peca}>
      <div className={s.formulario}>
        {peca ? (
          <>
            <div className={s.tarefaNome}>{peca.titulo}</div>
            {peca.status_atual === "AGUARDANDO_ASSINATURA" ? <div className={s.dica}>Esta peça já está em assinatura. Emitir de novo gera uma versão nova.</div> : null}
            {peca.texto_corrido ? <div className={s.ou}>Esta peça entra no documento como texto corrido (a fase interna monta o cabeçalho, a conclusão e a assinatura).</div> : null}
            <EditorPeca id={`peca-lic-${tipo}`} html={html} onChange={setHtml} cabecalho={`${peca.titulo} · cabeçalho do órgão e nº do processo entram no PDF`} rodape="Assinatura eletrônica pelo portal de assinaturas, como hoje." />
            <div className={s.acoes}>
              {aviso ? <span className={s.ou}>{aviso}</span> : null}
              {iaModelo ? <span className={s.seloIa}>Rascunho da IA — revise antes de emitir</span> : null}
              {peca.ia_disponivel ? (
                <button type="button" className={`${s.botao} ${s.secundario}`} onClick={gerarRascunho} disabled={gerando || enviando}>
                  {gerando ? "Escrevendo…" : "Pedir rascunho à IA"}
                </button>
              ) : null}
            </div>
            {peca.extra ? (
              <>
                <label className={s.rotulo} htmlFor={`peca-lic-extra-${tipo}`}>
                  {peca.extra.rotulo}
                </label>
                <textarea id={`peca-lic-extra-${tipo}`} className={s.campo} value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={20000} />
              </>
            ) : null}
            {peca.conclusoes ? (
              <>
                <label className={s.rotulo} htmlFor={`peca-lic-conclusao-${tipo}`}>
                  Conclusão
                </label>
                <select id={`peca-lic-conclusao-${tipo}`} className={s.campo} value={conclusao} onChange={(e) => setConclusao(e.target.value)}>
                  <option value="">Escolha…</option>
                  {peca.conclusoes.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </>
        ) : null}
        {erro ? (
          <div className={s.erro} role="alert">
            {erro}
          </div>
        ) : null}
        <div className={s.acoes}>
          {peca ? (
            <button type="button" className={`${s.botao} ${s.primario}`} onClick={emitir} disabled={enviando || gerando}>
              {enviando ? "Emitindo…" : peca.acao}
            </button>
          ) : null}
          <button type="button" className={`${s.botao} ${s.secundario}`} onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
