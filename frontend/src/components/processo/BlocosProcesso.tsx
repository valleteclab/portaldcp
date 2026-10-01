"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import {
  chamarProcessos,
  dataHora,
  enviarArquivoDoProcesso,
  rotuloFolhas,
  soData,
  textoDoErro,
  textoPosse,
  urlDoArquivo,
  type Autos,
  type ComQuemEsta,
  type Destinos,
  type Etapa,
  type EventoLinhaDoTempo,
  type Fluxo,
  type Peca,
  type ProcessoVisao,
} from "@/lib/processo/processo"
import s from "./processo.module.css"

/** Wrapper com os tokens de cor da tela (claro/escuro). */
export function TemaProcesso({ children }: { children: React.ReactNode }) {
  return <div className={s.tema}>{children}</div>
}

export { s as estilos }

/* ---------------------------------------------------------------- Está com */

export function BlocoEstaCom({
  posse,
  encerrado,
  podeReceber,
  onReceber,
  recebendo,
  erro,
}: {
  posse: ComQuemEsta | null
  encerrado: boolean
  podeReceber: boolean
  onReceber: () => void
  recebendo: boolean
  erro: string | null
}) {
  return (
    <section className={s.bloco} aria-labelledby="bloco-esta-com">
      <div className={s.eyebrow} id="bloco-esta-com">
        Está com
      </div>
      {!posse ? (
        <p className={s.texto} style={{ marginTop: 6 }}>
          {encerrado ? "Processo encerrado." : "Este processo ainda não tem tramitação registrada."}
        </p>
      ) : (
        <div className={s.estaCom}>
          <div className={s.quem}>
            <div className={s.setor}>
              {posse.setor_nome || posse.texto}
              {posse.usuario_nome ? <span> · {posse.usuario_nome}</span> : null}
            </div>
            <div className={s.quando}>
              {posse.recebida ? "Recebido" : "Enviado"} em {dataHora(posse.desde)}
              {posse.enviado_por ? ` · enviado por ${posse.enviado_por}` : ""}{" "}
              <span className={`${s.chip} ${posse.recebida ? s.chipOk : s.chipEspera}`}>
                {posse.recebida ? "Recebido" : "Aguardando recebimento"}
              </span>
            </div>
            {posse.despacho ? <p className={s.despachoRecebido}>{posse.despacho}</p> : null}
          </div>
          {podeReceber ? (
            <div className={s.acoes}>
              <button type="button" className={`${s.botao} ${s.primario}`} onClick={onReceber} disabled={recebendo}>
                {recebendo ? "Recebendo..." : "Receber processo"}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {erro ? (
        <div className={s.erro} role="alert" style={{ marginTop: 10 }}>
          {erro}
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------- Formulário de peça */

export function FormularioPeca({
  processoId,
  etapa,
  tituloInicial,
  rotuloBotao,
  onJuntada,
  onCancelar,
}: {
  processoId: string
  /** Etapa atual do fluxo (conclui a etapa); null para peça avulsa. */
  etapa: Etapa | null
  tituloInicial: string
  rotuloBotao: string
  onJuntada: () => void
  onCancelar: () => void
}) {
  const [titulo, setTitulo] = useState(tituloInicial)
  const [texto, setTexto] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [paginas, setPaginas] = useState("1")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function juntar() {
    setErro(null)
    if (titulo.trim().length < 3) return setErro("Informe o título da peça.")
    if (!texto.trim() && !arquivo) return setErro("Escreva o texto da peça ou anexe o arquivo.")
    setEnviando(true)
    try {
      let arquivo_url: string | undefined
      let arquivo_nome: string | undefined
      if (arquivo) {
        const up = await enviarArquivoDoProcesso(arquivo)
        arquivo_url = up.url
        arquivo_nome = up.nome
      }
      await chamarProcessos(`/${processoId}/pecas`, {
        metodo: "POST",
        padrao: "Não foi possível juntar a peça.",
        corpo: {
          titulo: titulo.trim(),
          texto: texto.trim() || undefined,
          arquivo_url,
          arquivo_nome,
          paginas: arquivo ? Math.max(1, Number(paginas) || 1) : undefined,
          etapa: etapa?.chave,
          tipo_peca: etapa?.tipo_peca || undefined,
        },
      })
      onJuntada()
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível juntar a peça."))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className={s.peca}>
      <div className={s.formulario}>
        <label className={s.rotulo} htmlFor={`peca-titulo-${etapa?.chave ?? "avulsa"}`}>
          Título da peça
        </label>
        <input
          id={`peca-titulo-${etapa?.chave ?? "avulsa"}`}
          className={s.campo}
          value={titulo}
          maxLength={300}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <label className={s.rotulo} htmlFor={`peca-texto-${etapa?.chave ?? "avulsa"}`}>
          Texto
        </label>
        <textarea
          id={`peca-texto-${etapa?.chave ?? "avulsa"}`}
          className={s.campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva aqui o conteúdo da peça"
        />
        <div className={s.ou}>ou anexe o documento já pronto (PDF)</div>
        <input
          type="file"
          className={s.campo}
          accept=".pdf,application/pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          aria-label="Anexar arquivo"
        />
        {arquivo ? (
          <>
            <label className={s.rotulo} htmlFor="peca-paginas">
              Quantas páginas tem o arquivo
            </label>
            <input
              id="peca-paginas"
              type="number"
              min={1}
              max={500}
              className={`${s.campo} ${s.campoPequeno}`}
              value={paginas}
              onChange={(e) => setPaginas(e.target.value)}
            />
          </>
        ) : null}
        {erro ? (
          <div className={s.erro} role="alert">
            {erro}
          </div>
        ) : null}
        <div className={s.acoes}>
          <button type="button" className={`${s.botao} ${s.primario}`} onClick={juntar} disabled={enviando}>
            {enviando ? "Juntando..." : rotuloBotao}
          </button>
          <button type="button" className={`${s.botao} ${s.secundario}`} onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Sua vez */

export function BlocoSuaVez({
  processoId,
  etapa,
  linkTermo,
  onJuntada,
}: {
  processoId: string
  etapa: Etapa
  /** Para etapa de resultado (cadastro do termo no contrato). */
  linkTermo: string | null
  onJuntada: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ehResultado = !!etapa.resultado
  return (
    <section className={`${s.bloco} ${s.vez}`} aria-labelledby="bloco-sua-vez">
      <div className={s.eyebrow} id="bloco-sua-vez">
        Sua vez
      </div>
      <h2>{ehResultado ? `Etapa atual: ${etapa.rotulo}` : `Falta fazer: ${etapa.rotulo}`}</h2>
      <div className={s.tarefas}>
        <div className={s.tarefa}>
          <span className={s.marca} aria-hidden="true" />
          <div className={s.tarefaTexto}>
            <span className={s.tarefaNome}>{etapa.titulo_peca || etapa.rotulo}</span>
            <span className={s.tarefaEstado}>
              {ehResultado ? "O termo é cadastrado no contrato e liga-se a este processo" : "Junte a peça desta etapa aos autos"}
            </span>
          </div>
          {ehResultado ? (
            linkTermo ? (
              <Link href={linkTermo} className={`${s.botao} ${s.primario}`}>
                Cadastrar o termo no contrato
              </Link>
            ) : null
          ) : !aberto ? (
            <button type="button" className={`${s.botao} ${s.primario}`} onClick={() => setAberto(true)}>
              Fazer agora
            </button>
          ) : null}
          {aberto && !ehResultado ? (
            <FormularioPeca
              processoId={processoId}
              etapa={etapa}
              tituloInicial={etapa.titulo_peca || etapa.rotulo}
              rotuloBotao="Juntar aos autos"
              onJuntada={() => {
                setAberto(false)
                onJuntada()
              }}
              onCancelar={() => setAberto(false)}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** Processo AVULSO (sem etapas): juntar peça quando quiser. */
export function BlocoPecaAvulsa({ processoId, onJuntada }: { processoId: string; onJuntada: () => void }) {
  const [aberto, setAberto] = useState(false)
  return (
    <section className={`${s.bloco} ${s.vez}`} aria-labelledby="bloco-peca-avulsa">
      <div className={s.eyebrow} id="bloco-peca-avulsa">
        Sua vez
      </div>
      <h2>Este processo está com você</h2>
      <div className={s.tarefas}>
        <div className={s.tarefa}>
          <span className={s.marca} aria-hidden="true" />
          <div className={s.tarefaTexto}>
            <span className={s.tarefaNome}>Juntar peça aos autos</span>
            <span className={s.tarefaEstado}>Opcional. Depois, envie o processo para quem for preciso.</span>
          </div>
          {!aberto ? (
            <button type="button" className={`${s.botao} ${s.primario}`} onClick={() => setAberto(true)}>
              Juntar peça
            </button>
          ) : (
            <FormularioPeca
              processoId={processoId}
              etapa={null}
              tituloInicial=""
              rotuloBotao="Juntar aos autos"
              onJuntada={() => {
                setAberto(false)
                onJuntada()
              }}
              onCancelar={() => setAberto(false)}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/** Quando não é a vez do usuário. */
export function BlocoAguardando({ posse, encerrado, motivo }: { posse: ComQuemEsta | null; encerrado: boolean; motivo: string | null }) {
  return (
    <section className={`${s.bloco} ${s.neutro}`}>
      <div className={s.eyebrow}>{encerrado ? "Situação" : "Sua vez"}</div>
      {encerrado ? (
        <>
          <h2>Processo encerrado</h2>
          <p>{motivo ? `Motivo: ${motivo}` : "Não há mais nada a fazer neste processo."}</p>
        </>
      ) : (
        <>
          <h2>Nada para você fazer agora</h2>
          <p>
            {posse
              ? `O processo está com ${textoPosse(posse)}. Você acompanha por aqui e é avisado quando ele chegar até você.`
              : "O processo não tem tramitação registrada."}
          </p>
        </>
      )}
    </section>
  )
}

/* ------------------------------------------------------ Enviar / Devolver */

export function BlocoEnviar({
  processoId,
  posse,
  ehAvulso,
  onTramitou,
  onEncerrou,
}: {
  processoId: string
  posse: ComQuemEsta | null
  ehAvulso: boolean
  onTramitou: () => void
  onEncerrou: () => void
}) {
  const [destinos, setDestinos] = useState<Destinos | null>(null)
  const [erroDestinos, setErroDestinos] = useState<string | null>(null)
  const [destino, setDestino] = useState("")
  const [despacho, setDespacho] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<"enviar" | "devolver" | "encerrar">("enviar")
  const [motivo, setMotivo] = useState("")

  useEffect(() => {
    let vivo = true
    chamarProcessos<Destinos>(`/${processoId}/destinos`, { padrao: "Não foi possível carregar os destinos." })
      .then((d) => {
        if (!vivo) return
        setDestinos(d)
        if (d.sugerido?.setor_id) setDestino(`setor:${d.sugerido.setor_id}`)
      })
      .catch((e) => vivo && setErroDestinos(textoDoErro(e, "Não foi possível carregar os destinos.")))
    return () => {
      vivo = false
    }
  }, [processoId])

  const usuariosPorSetor = useMemo(() => destinos?.usuarios ?? [], [destinos])

  async function enviar() {
    setErro(null)
    if (!destino) return setErro("Escolha para quem enviar o processo.")
    if (despacho.trim().length < 3) return setErro("Escreva o despacho: diga ao destinatário o que precisa ser feito.")
    const [tipo, id] = destino.split(":")
    setEnviando(true)
    try {
      await chamarProcessos(`/${processoId}/enviar`, {
        metodo: "POST",
        padrao: "Não foi possível enviar o processo.",
        corpo: { [tipo === "setor" ? "para_setor_id" : "para_usuario_id"]: id, despacho: despacho.trim() },
      })
      setDespacho("")
      onTramitou()
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível enviar o processo."))
    } finally {
      setEnviando(false)
    }
  }

  async function devolver() {
    setErro(null)
    if (despacho.trim().length < 3) return setErro("Escreva o despacho: diga por que está devolvendo.")
    setEnviando(true)
    try {
      await chamarProcessos(`/${processoId}/devolver`, {
        metodo: "POST",
        padrao: "Não foi possível devolver o processo.",
        corpo: { despacho: despacho.trim() },
      })
      setDespacho("")
      onTramitou()
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível devolver o processo."))
    } finally {
      setEnviando(false)
    }
  }

  async function encerrar() {
    setErro(null)
    setEnviando(true)
    try {
      await chamarProcessos(`/${processoId}/encerrar`, {
        metodo: "POST",
        padrao: "Não foi possível encerrar o processo.",
        corpo: { motivo: motivo.trim() || undefined },
      })
      onEncerrou()
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível encerrar o processo."))
    } finally {
      setEnviando(false)
    }
  }

  const podeDevolver = !!posse?.enviado_por

  return (
    <section className={s.bloco} aria-labelledby="bloco-enviar">
      <div className={s.eyebrow} id="bloco-enviar">
        {modo === "devolver" ? "Devolver" : modo === "encerrar" ? "Encerrar" : "Enviar para"}
      </div>

      {modo === "enviar" ? (
        <div className={s.formulario} style={{ marginTop: 8 }}>
          {erroDestinos ? (
            <div className={s.erro} role="alert">
              {erroDestinos}
            </div>
          ) : null}
          {destinos?.sugerido ? (
            <div className={s.dica}>
              Sugerido para a próxima etapa: {destinos.sugerido.setor_nome}. {destinos.sugerido.motivo}
            </div>
          ) : null}
          <label className={s.rotulo} htmlFor="destino-processo">
            Setor ou pessoa
          </label>
          <select id="destino-processo" className={s.campo} value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Escolha o destino</option>
            <optgroup label="Setores">
              {(destinos?.setores ?? []).map((st) => (
                <option key={st.id} value={`setor:${st.id}`}>
                  {st.nome}
                </option>
              ))}
            </optgroup>
            {usuariosPorSetor.length > 0 ? (
              <optgroup label="Pessoas">
                {usuariosPorSetor.map((u) => (
                  <option key={u.id} value={`usuario:${u.id}`}>
                    {u.nome}
                    {u.cargo ? ` — ${u.cargo}` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <label className={s.rotulo} htmlFor="despacho-processo">
            Despacho (o que o destinatário precisa fazer)
          </label>
          <textarea
            id="despacho-processo"
            className={s.campo}
            value={despacho}
            onChange={(e) => setDespacho(e.target.value)}
            placeholder="Ex.: Segue para emissão do parecer jurídico."
          />
          {erro ? (
            <div className={s.erro} role="alert">
              {erro}
            </div>
          ) : null}
          <div className={s.acoes}>
            <button type="button" className={`${s.botao} ${s.primario}`} onClick={enviar} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar processo"}
            </button>
            {podeDevolver ? (
              <button type="button" className={`${s.botao} ${s.secundario}`} onClick={() => { setErro(null); setModo("devolver") }}>
                Devolver
              </button>
            ) : null}
            {ehAvulso ? (
              <button type="button" className={`${s.botao} ${s.perigo}`} onClick={() => { setErro(null); setModo("encerrar") }}>
                Encerrar o processo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {modo === "devolver" ? (
        <div className={s.formulario} style={{ marginTop: 8 }}>
          <p className={s.texto}>O processo volta para {posse?.enviado_por ?? "quem enviou"}.</p>
          <label className={s.rotulo} htmlFor="despacho-devolucao">
            Motivo da devolução
          </label>
          <textarea id="despacho-devolucao" className={s.campo} value={despacho} onChange={(e) => setDespacho(e.target.value)} />
          {erro ? (
            <div className={s.erro} role="alert">
              {erro}
            </div>
          ) : null}
          <div className={s.acoes}>
            <button type="button" className={`${s.botao} ${s.primario}`} onClick={devolver} disabled={enviando}>
              {enviando ? "Devolvendo..." : "Devolver processo"}
            </button>
            <button type="button" className={`${s.botao} ${s.secundario}`} onClick={() => { setErro(null); setModo("enviar") }} disabled={enviando}>
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {modo === "encerrar" ? (
        <div className={s.formulario} style={{ marginTop: 8 }}>
          <p className={s.texto}>Ao encerrar, o processo deixa de tramitar. Os autos continuam disponíveis para consulta.</p>
          <label className={s.rotulo} htmlFor="motivo-encerramento">
            Motivo (opcional)
          </label>
          <textarea id="motivo-encerramento" className={s.campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {erro ? (
            <div className={s.erro} role="alert">
              {erro}
            </div>
          ) : null}
          <div className={s.acoes}>
            <button type="button" className={`${s.botao} ${s.perigo}`} onClick={encerrar} disabled={enviando}>
              {enviando ? "Encerrando..." : "Confirmar encerramento"}
            </button>
            <button type="button" className={`${s.botao} ${s.secundario}`} onClick={() => { setErro(null); setModo("enviar") }} disabled={enviando}>
              Voltar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ Etapas */

export function BlocoEtapas({ fluxo }: { fluxo: Fluxo | null }) {
  if (!fluxo || !fluxo.disponivel || !fluxo.tem_fluxo || !fluxo.etapas?.length) return null
  const concluidas = fluxo.etapas.filter((e) => e.estado === "CONCLUIDA").length
  return (
    <section className={s.bloco} aria-labelledby="bloco-etapas">
      <div className={s.eyebrow} id="bloco-etapas">
        Etapas · {concluidas} de {fluxo.etapas.length} concluídas
      </div>
      <ol className={s.etapas} style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {fluxo.etapas.map((e) => (
          <li
            key={e.chave}
            className={`${s.etapa} ${e.estado === "CONCLUIDA" ? s.etapaFeita : e.estado === "ATUAL" ? s.etapaAtual : ""}`}
            aria-current={e.estado === "ATUAL" ? "step" : undefined}
          >
            <span className={s.barra} aria-hidden="true" />
            <span className={s.etapaNome}>
              {e.rotulo}
              <span className="sr-only"> — {e.estado === "CONCLUIDA" ? "concluída" : e.estado === "ATUAL" ? "etapa atual" : "ainda não chegou"}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* --------------------------------------------------------------- Resultado */

export function BlocoResultado({
  processo,
  etapaAtual,
  linkTermo,
}: {
  processo: ProcessoVisao
  etapaAtual: Etapa | null
  linkTermo: string | null
}) {
  const termo = processo.conteudo?.termo ?? null
  const contratoId = processo.contrato_id
  const nomeResultado = processo.tipo === "RENOVACAO" ? "Termo de renovação" : "Termo aditivo"
  return (
    <section className={s.bloco} aria-labelledby="bloco-resultado">
      <div className={s.eyebrow} id="bloco-resultado">
        Resultado do processo
      </div>
      <div className={s.resultado}>
        <div className={s.resultadoTexto}>
          {termo ? (
            <>
              <span className={s.resultadoNome}>
                {nomeResultado}
                {termo.numero_termo ? ` nº ${termo.numero_termo}` : ""}
              </span>
              <span className={s.resultadoDetalhe}>
                Cadastrado no contrato{termo.data_assinatura ? ` · assinado em ${soData(termo.data_assinatura)}` : ""}
              </span>
            </>
          ) : (
            <>
              <span className={s.resultadoNome}>{nomeResultado} ainda não cadastrado</span>
              <span className={s.resultadoDetalhe}>
                {etapaAtual?.resultado
                  ? "Chegou a hora: cadastre o termo no contrato para concluir este processo."
                  : "O resultado aparece aqui quando o termo for cadastrado no contrato, depois das etapas acima."}
              </span>
            </>
          )}
        </div>
        {termo && contratoId ? (
          <Link href={`/orgao/contratos/${contratoId}?tab=termos`} className={`${s.botao} ${s.secundario}`}>
            Ver no contrato
          </Link>
        ) : etapaAtual?.resultado && linkTermo ? (
          <Link href={linkTermo} className={`${s.botao} ${s.primario}`}>
            Cadastrar o termo no contrato
          </Link>
        ) : null}
      </div>
    </section>
  )
}

/* ----------------------------------------------- Linha do tempo / Detalhes */

export function SecaoLinhaDoTempo({ eventos }: { eventos: EventoLinhaDoTempo[] }) {
  return (
    <details className={s.bloco}>
      <summary className={s.resumo}>
        Linha do tempo <span className={s.resumoInfo}>{eventos.length} {eventos.length === 1 ? "registro" : "registros"}</span>
      </summary>
      {eventos.length === 0 ? (
        <div className={s.corpo}>
          <p>Ainda não há registros.</p>
        </div>
      ) : (
        <ul className={s.tempo}>
          {eventos.map((ev, i) => (
            <li key={`${ev.quando}-${i}`}>
              <span className={s.hora}>{dataHora(ev.quando)}</span>
              <span>
                <strong>{ev.titulo}</strong>
                {ev.por ? <span className={s.pecaMeta}> · {ev.por}</span> : null}
                {ev.detalhe ? <span className={s.detalheEvento}>{ev.detalhe}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function LinhaPeca({ peca }: { peca: Peca }) {
  const [verTexto, setVerTexto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <li>
      <span className={s.pecaTitulo}>
        {peca.numero_peca}. {peca.titulo}
      </span>
      <span className={s.pecaMeta}>
        {rotuloFolhas(peca.folha_inicial, peca.folha_final)}
        {peca.criado_por_nome ? ` · ${peca.criado_por_nome}` : ""} · {dataHora(peca.created_at)}
      </span>
      <div className={s.acoes}>
        {peca.arquivo_url ? (
          <button
            type="button"
            className={s.discreto}
            onClick={() => {
              setErro(null)
              abrirArquivoAutenticado(urlDoArquivo(peca.arquivo_url as string)).catch(() => setErro("Não foi possível abrir o arquivo."))
            }}
          >
            Abrir arquivo{peca.arquivo_nome ? ` (${peca.arquivo_nome})` : ""}
          </button>
        ) : null}
        {peca.texto ? (
          <button type="button" className={s.discreto} onClick={() => setVerTexto((v) => !v)} aria-expanded={verTexto}>
            {verTexto ? "Esconder texto" : "Ver texto"}
          </button>
        ) : null}
      </div>
      {erro ? <span className={s.erro}>{erro}</span> : null}
      {verTexto && peca.texto ? <p className={s.pecaTexto}>{peca.texto}</p> : null}
    </li>
  )
}

export function SecaoDetalhes({ processo, autos }: { processo: ProcessoVisao; autos: Autos | null }) {
  const pecas = autos?.juntadas ?? []
  return (
    <details className={s.bloco}>
      <summary className={s.resumo}>
        Detalhes <span className={s.resumoInfo}>autos e peças</span>
      </summary>
      <div className={s.corpo}>
        <p>
          Aberto em {dataHora(processo.aberto_em)}
          {processo.aberto_por_nome ? ` por ${processo.aberto_por_nome}` : ""}.
          {processo.encerrado_em ? ` Encerrado em ${dataHora(processo.encerrado_em)}.` : ""}
        </p>
        {autos?.disponivel && autos.autuacao ? <p>{autos.autuacao}</p> : null}
        {autos?.disponivel && typeof autos.total_folhas === "number" ? <p>Total de folhas: {autos.total_folhas}</p> : null}
        <div className={s.eyebrow} style={{ marginTop: 12 }}>
          Peças juntadas
        </div>
        {pecas.length === 0 ? (
          <p style={{ marginTop: 6 }}>Nenhuma peça juntada ainda.</p>
        ) : (
          <ul className={s.pecas}>
            {pecas.map((p) => (
              <LinhaPeca key={p.id} peca={p} />
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
