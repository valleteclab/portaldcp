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
  temLacuna,
  textoDoErro,
  textoPosse,
  urlDoArquivo,
  type Autos,
  type ComQuemEsta,
  type ConferenciaPublicacao,
  type ConteudoLicitacao,
  TIPOS_PECA_EDITOR_LICITACAO,
  type Destinos,
  type Etapa,
  type EventoLinhaDoTempo,
  type Fluxo,
  type ModeloDaPeca,
  type Peca,
  type ProcessoVisao,
  type RascunhoDaPeca,
} from "@/lib/processo/processo"
import { EditorPeca } from "./EditorPeca"
import { FormularioPecaLicitacao } from "./FormularioPecaLicitacao"
import { rotaFazerAqui } from "@/lib/fase-interna/telas"
import { ROTULO_CRITERIO, rotuloModalidade } from "@/lib/licitacao-rotulos"
import { API_URL, authFetch } from "@/lib/api"
import { confirmarAcao, pedirTextoAcao } from "@/components/DialogoGlobal"
import s from "./processo.module.css"

const DICA_LACUNA = "Clique em cada lacuna laranja e escreva no lugar: a marca some sozinha."

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
  const sufixo = etapa?.chave ?? "avulsa"
  const [caminho, setCaminho] = useState<"escrever" | "ia" | "anexar">("escrever")
  const [titulo, setTitulo] = useState(tituloInicial)
  const [html, setHtml] = useState("")
  const [modelo, setModelo] = useState<ModeloDaPeca | null>(null)
  const [modeloId, setModeloId] = useState<string | null>(null)
  const [iaModelo, setIaModelo] = useState<string | null>(null)
  const [orientacao, setOrientacao] = useState("")
  const [gerando, setGerando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [paginas, setPaginas] = useState("1")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Modelo da etapa: ponto de partida do editor (lacunas em destaque)
  useEffect(() => {
    let vivo = true
    chamarProcessos<ModeloDaPeca>(`/${processoId}/pecas/modelo${etapa ? `?etapa=${encodeURIComponent(etapa.chave)}` : ""}`, { padrao: "Não foi possível carregar o modelo." })
      .then((m) => {
        if (!vivo) return
        setModelo(m)
        setModeloId(m.modelo_id)
        setHtml((atual) => atual || m.html)
        setAviso(m.modelos.length ? `Modelo "${m.modelos[0].nome}". ${DICA_LACUNA}` : `Texto padrão. ${DICA_LACUNA}`)
      })
      .catch(() => vivo && setModelo({ processo_id: processoId, etapa: etapa?.chave ?? null, titulo: tituloInicial, html: "", modelo_id: null, modelos: [], ia_disponivel: false }))
    return () => {
      vivo = false
    }
  }, [processoId, etapa?.chave, tituloInicial])

  async function gerarRascunho() {
    setErro(null)
    setGerando(true)
    try {
      const r = await chamarProcessos<RascunhoDaPeca>(`/${processoId}/pecas/rascunho`, {
        metodo: "POST",
        padrao: "A IA não conseguiu escrever o rascunho.",
        corpo: { etapa: etapa?.chave, orientacao: orientacao.trim() || undefined },
      })
      setHtml(r.html)
      if (r.titulo) setTitulo(r.titulo)
      setIaModelo(r.ia_modelo)
      setAviso(r.lacunas ? `A IA usou o que está nos autos. ${r.lacunas === 1 ? "Uma lacuna" : `${r.lacunas} lacunas`} para você preencher: ${DICA_LACUNA.toLowerCase()}` : "A IA usou o que está nos autos. Revise antes de juntar.")
      setCaminho("escrever")
    } catch (e) {
      setErro(textoDoErro(e, "A IA não conseguiu escrever o rascunho."))
    } finally {
      setGerando(false)
    }
  }

  function aoEditar(novo: string) {
    setHtml(novo)
    if (erro) setErro(null)
  }

  async function escolherModelo(id: string) {
    const escolhido = id === "__vazio" ? null : modelo?.modelos.find((m) => m.id === id) ?? null
    const htmlNovo = escolhido?.html ?? ""
    const textoAtual = html.replace(/<[^>]+>|&nbsp;/g, "").trim()
    const textoDoModeloAtual = (modelo?.modelos.find((m) => m.id === modeloId)?.html ?? modelo?.html ?? "").replace(/<[^>]+>|&nbsp;/g, "").trim()
    if (textoAtual && textoAtual !== textoDoModeloAtual) {
      const ok = await confirmarAcao({ titulo: "Trocar o modelo?", mensagem: "O texto que você escreveu será substituído pelo modelo escolhido.", confirmarRotulo: "Trocar", destrutivo: true })
      if (!ok) return
    }
    setModeloId(id === "__vazio" ? "__vazio" : id)
    setHtml(htmlNovo)
    setIaModelo(null)
    setAviso(escolhido ? `Modelo "${escolhido.nome}". ${DICA_LACUNA}` : "Em branco: escreva a peça.")
  }

  async function salvarComoModelo() {
    const texto = html.replace(/<[^>]+>|&nbsp;/g, "").trim()
    if (!texto) return setErro("Escreva o texto antes de salvar como modelo.")
    const nome = await pedirTextoAcao({ titulo: "Salvar como modelo do órgão", mensagem: "Este texto ficará disponível para as próximas peças desta etapa, em Configurações › Modelos de documento.", rotulo: "Nome do modelo", obrigatorio: true, minimo: 3, linhaUnica: true, valorInicial: titulo })
    if (!nome) return
    try {
      const r = await chamarProcessos<{ id: string; nome: string }>(`/${processoId}/pecas/modelos`, { metodo: "POST", padrao: "Não foi possível salvar o modelo.", corpo: { etapa: etapa?.chave, nome, html } })
      setModelo((m) => (m ? { ...m, modelos: [{ id: r.id, nome: r.nome, padrao_sistema: false, do_orgao: true, html }, ...m.modelos] } : m))
      setModeloId(r.id)
      setAviso(`Modelo "${r.nome}" salvo para o órgão.`)
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível salvar o modelo."))
    }
  }

  async function juntar() {
    setErro(null)
    if (titulo.trim().length < 3) return setErro("Informe o título da peça.")
    const noEditor = caminho !== "anexar"
    if (noEditor && !html.replace(/<[^>]+>|&nbsp;/g, "").trim()) return setErro("Escreva o texto da peça ou anexe o arquivo.")
    if (noEditor && temLacuna(html)) return setErro("Ainda há lacunas em laranja. Clique em cada uma e escreva o texto no lugar; a marca some sozinha.")
    if (!noEditor && !arquivo) return setErro("Escolha o arquivo PDF para anexar.")
    setEnviando(true)
    try {
      let arquivo_url: string | undefined
      let arquivo_nome: string | undefined
      if (!noEditor && arquivo) {
        const up = await enviarArquivoDoProcesso(arquivo)
        arquivo_url = up.url
        arquivo_nome = up.nome
      }
      await chamarProcessos(`/${processoId}/pecas`, {
        metodo: "POST",
        padrao: "Não foi possível juntar a peça.",
        corpo: {
          titulo: titulo.trim(),
          texto_html: noEditor ? html : undefined,
          ia_modelo: noEditor && iaModelo ? iaModelo : undefined,
          arquivo_url,
          arquivo_nome,
          paginas: !noEditor && arquivo ? Math.max(1, Number(paginas) || 1) : undefined,
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

  const iaDisponivel = modelo?.ia_disponivel ?? false
  const escolher = (c: typeof caminho) => (
    <button type="button" className={s.caminho} aria-pressed={caminho === c} onClick={() => setCaminho(c)} disabled={enviando}>
      {c === "escrever" ? (
        <>
          <b>Escrever</b>
          <small>Editor com formatação, cabeçalho do órgão e modelo da peça.</small>
        </>
      ) : c === "ia" ? (
        <>
          <b>Pedir rascunho à IA</b>
          <small>{iaDisponivel ? "A IA escreve a partir do processo; você revisa no editor." : "Indisponível neste servidor (IA não configurada)."}</small>
        </>
      ) : (
        <>
          <b>Anexar pronto</b>
          <small>PDF feito fora do sistema.</small>
        </>
      )}
    </button>
  )

  return (
    <div className={s.peca}>
      <div className={s.formulario}>
        <div className={s.caminhos} role="group" aria-label="Como fazer a peça">
          {escolher("escrever")}
          {escolher("ia")}
          {escolher("anexar")}
        </div>
        <label className={s.rotulo} htmlFor={`peca-titulo-${sufixo}`}>
          Título da peça
        </label>
        <input id={`peca-titulo-${sufixo}`} className={s.campo} value={titulo} maxLength={300} onChange={(e) => setTitulo(e.target.value)} />

        {caminho === "ia" ? (
          <>
            <ul className={s.sabe} aria-label="O que a IA já sabe">
              <li>
                <b>Processo</b>
                <span>Número, assunto e tipo</span>
              </li>
              <li>
                <b>Contrato</b>
                <span>Número, fornecedor, objeto e valor</span>
              </li>
              <li>
                <b>Autos</b>
                <span>As peças já juntadas</span>
              </li>
              <li>
                <b>Etapa</b>
                <span>{etapa?.rotulo ?? "Peça avulsa"}</span>
              </li>
            </ul>
            <label className={s.rotulo} htmlFor={`peca-orientacao-${sufixo}`}>
              O que mais a IA deve considerar (opcional)
            </label>
            <textarea
              id={`peca-orientacao-${sufixo}`}
              className={s.campo}
              value={orientacao}
              onChange={(e) => setOrientacao(e.target.value)}
              placeholder="Ex.: usar a dotação 02.01.04.122.0003.2010 e o elemento 3.3.90.39."
              maxLength={2000}
            />
            {gerando ? (
              <div className={s.gerando} role="status">
                <span className={s.pulso} aria-hidden="true" />
                Lendo os autos e escrevendo a peça…
              </div>
            ) : (
              <div className={s.acoes}>
                <button type="button" className={`${s.botao} ${s.primario}`} onClick={gerarRascunho} disabled={!iaDisponivel || enviando}>
                  Gerar rascunho
                </button>
                <span className={s.ou}>O rascunho vai para o editor com as lacunas marcadas. Nada é juntado sem a sua revisão.</span>
              </div>
            )}
          </>
        ) : null}

        {caminho === "anexar" ? (
          <>
            <div className={s.solta}>
              <b>Escolha o PDF feito fora do sistema</b>
              <input
                type="file"
                className={s.campo}
                accept=".pdf,application/pdf"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                aria-label="Anexar arquivo"
              />
              <span className={s.ou}>O sistema numera as folhas e registra a juntada.</span>
            </div>
            {arquivo ? (
              <>
                <label className={s.rotulo} htmlFor={`peca-paginas-${sufixo}`}>
                  Quantas páginas tem o arquivo
                </label>
                <input
                  id={`peca-paginas-${sufixo}`}
                  type="number"
                  min={1}
                  max={500}
                  className={`${s.campo} ${s.campoPequeno}`}
                  value={paginas}
                  onChange={(e) => setPaginas(e.target.value)}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <EditorPeca
              id={`peca-texto-${sufixo}`}
              html={html}
              onChange={aoEditar}
              cabecalho={`${etapa?.rotulo ?? "Peça avulsa"} · cabeçalho do órgão e nº do processo entram no PDF`}
              rodape="Local, data e assinatura eletrônica entram no PDF ao juntar."
              modelos={modelo?.modelos ?? []}
              modeloId={modeloId}
              onEscolherModelo={etapa?.tipo_peca ? escolherModelo : undefined}
              onSalvarModelo={etapa?.tipo_peca ? salvarComoModelo : undefined}
            />
            <div className={s.acoes}>
              {aviso ? <span className={s.ou}>{aviso}</span> : null}
              {iaModelo ? <span className={s.seloIa}>Rascunho da IA — revise antes de juntar</span> : null}
            </div>
          </>
        )}
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

/* ------------------------------------------------- Sua vez (licitação) */

/**
 * Licitação na tela do processo: as peças da etapa atual vêm do fluxo da fase
 * interna e cada uma abre onde já é feita hoje ("Fazer aqui"). Sem trava: o
 * fluxo sugere; o envio é livre.
 */
export function BlocoSuaVezLicitacao({ processoId, licitacaoId, etapa, onFeito }: { processoId: string; licitacaoId: string; etapa: Etapa | null; onFeito: (mensagem: string) => void }) {
  const pecas = etapa?.pecas ?? []
  const [escrevendo, setEscrevendo] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  return (
    <section className={`${s.bloco} ${s.vez}`} aria-labelledby="bloco-sua-vez">
      <div className={s.eyebrow} id="bloco-sua-vez">
        Sua vez
      </div>
      <h2>{etapa ? `Falta fazer: ${etapa.rotulo}` : "O processo está com você"}</h2>
      {feito ? <div className={s.dica}>{feito}</div> : null}
      {pecas.length ? (
        <div className={s.tarefas}>
          {pecas.map((pc) => {
            const noEditor = TIPOS_PECA_EDITOR_LICITACAO.includes(pc.tipo) && !pc.pronta
            return (
              <div key={`${pc.passo}-${pc.tipo}`} className={`${s.tarefa} ${pc.pronta ? s.feita : ""}`}>
                <span className={s.marca} aria-hidden="true" />
                <div className={s.tarefaTexto}>
                  <span className={s.tarefaNome}>{pc.titulo}</span>
                  <span className={s.tarefaEstado}>
                    {pc.pronta ? "Pronta" : rotuloStatusPeca(pc.status)}
                    {pc.obrigatorio ? "" : " · opcional"}
                    {!pc.pronta && !pc.pode_iniciar ? " · aguarda etapa anterior" : ""}
                  </span>
                </div>
                {noEditor && escrevendo !== pc.tipo ? (
                  <button type="button" className={`${s.botao} ${s.primario}`} onClick={() => setEscrevendo(pc.tipo)}>
                    Escrever aqui
                  </button>
                ) : null}
                <Link href={rotaFazerAqui(licitacaoId, pc.tipo)} className={`${s.botao} ${pc.pronta || noEditor ? s.secundario : s.primario}`}>
                  {pc.pronta ? "Ver" : noEditor ? "Tela da peça" : pc.status === "EM_ELABORACAO" ? "Continuar" : "Fazer aqui"}
                </Link>
                {escrevendo === pc.tipo ? (
                  <FormularioPecaLicitacao
                    processoId={processoId}
                    tipo={pc.tipo}
                    onCancelar={() => setEscrevendo(null)}
                    onFeito={(m) => {
                      setEscrevendo(null)
                      setFeito(m)
                      onFeito(m)
                    }}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className={s.texto}>Nenhuma peça pendente nesta etapa. Envie o processo para o próximo setor ou abra a licitação para ver tudo.</p>
      )}
    </section>
  )
}

/* ------------------------------------------ Licitação: publicação e dados */

/**
 * Checklist de publicação (art. 72) na tela do processo: a única trava do
 * fluxo. Cada pendência leva à tela onde se resolve; o botão de publicar
 * continua nos detalhes da licitação até a fase externa vir para cá.
 */
export function BlocoPublicacaoLicitacao({ licitacaoId, modalidade }: { licitacaoId: string; modalidade: string | null }) {
  const [conf, setConf] = useState<ConferenciaPublicacao | null>(null)
  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/conferencia-publicacao`)
      .then(async (r) => (r.ok ? ((await r.json()) as ConferenciaPublicacao) : null))
      .then((c) => vivo && setConf(c))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [licitacaoId])
  if (!conf || !conf.aplicavel || !conf.itens?.length) return null
  const detalhes = `/orgao/processos/${licitacaoId}?detalhes=1`
  const linkDaAcao = (acao: string | null): { href: string; rotulo: string } | null => {
    switch (acao) {
      case "ABRIR_FASE_INTERNA":
        return null
      case "ABRIR_CONFORMIDADE":
        return { href: `/orgao/processos/${licitacaoId}/fase-interna/conformidade`, rotulo: "Abrir a conformidade" }
      case "ABRIR_CONTROLE_INTERNO":
        return { href: `/orgao/processos/${licitacaoId}/fase-interna/controle-interno`, rotulo: "Abrir o controle interno" }
      case "CADASTRAR_ITENS":
        return { href: `/orgao/processos/${licitacaoId}/editar?aba=itens`, rotulo: "Cadastrar itens" }
      case "VINCULAR_PCA":
        return { href: `/orgao/processos/${licitacaoId}/editar?aba=classificacao`, rotulo: "Vincular ou justificar" }
      case "CONFIGURAR_ME_EPP":
        return { href: `${detalhes}#cotas-me-epp`, rotulo: "Resolver ME/EPP" }
      case "ANEXAR_EDITAL":
        return { href: `${detalhes}#publicacao-edital`, rotulo: "Anexar edital" }
      case "GERAR_AVISO":
      case "CANCELAR_PUBLICACAO":
        return { href: `${detalhes}#publicacao-edital`, rotulo: acao === "GERAR_AVISO" ? "Gerar aviso" : "Cancelar publicação" }
      default:
        return null
    }
  }
  const dispensa = modalidade === "DISPENSA_ELETRONICA"
  const pendentes = conf.itens.filter((i) => i.bloqueia && i.estado === "PENDENTE").length
  return (
    <section className={s.bloco} aria-labelledby="bloco-publicacao">
      <div className={s.eyebrow} id="bloco-publicacao">
        Publicação · {pendentes ? `${pendentes} ${pendentes === 1 ? "pendência" : "pendências"}` : "pronto para publicar"}
      </div>
      <p className={s.texto} style={{ marginTop: 6 }}>
        {dispensa ? "O aviso de dispensa" : "O edital"} só é publicado quando a lista do art. 72 estiver completa. No meio do caminho o envio é livre.
      </p>
      <ul className={s.pecas} style={{ marginTop: 10 }}>
        {conf.itens.map((i) => {
          const link = linkDaAcao(i.acao)
          return (
            <li key={i.chave} className={s.tarefa}>
              <span className={`${s.chip} ${i.estado === "OK" ? s.chipOk : s.chipEspera}`}>{i.estado === "OK" ? "Pronto" : i.estado === "ALERTA" ? "Atenção" : "Pendente"}</span>
              <div className={s.tarefaTexto}>
                <span className={s.tarefaNome}>{i.rotulo}</span>
                <span className={s.tarefaEstado}>{i.detalhe || i.pendencias.join("; ") || i.fundamento}</span>
              </div>
              {link && i.estado !== "OK" ? (
                <Link href={link.href} className={`${s.botao} ${s.secundario}`}>
                  {link.rotulo}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className={s.acoes} style={{ marginTop: 12 }}>
        <Link href={`${detalhes}#publicacao-edital`} className={`${s.botao} ${pendentes ? s.secundario : s.primario}`}>
          {dispensa ? "Divulgar o aviso" : "Publicar o edital"} (detalhes da licitação)
        </Link>
      </div>
    </section>
  )
}

/** Dados da contratação, recolhidos, com o atalho para os detalhes da licitação. */
export function BlocoDadosLicitacao({ licitacaoId, lic }: { licitacaoId: string; lic: ConteudoLicitacao | null }) {
  const valor = lic?.valor_total_estimado
  const linhas: Array<[string, string]> = [
    ["Modalidade", `${rotuloModalidade(lic?.modalidade)}${lic?.srp ? " (SRP)" : ""}`],
    ["Fundamento", lic?.fundamento_legal || "—"],
    ["Critério", (lic?.criterio_julgamento && ROTULO_CRITERIO[lic.criterio_julgamento]) || lic?.criterio_julgamento || "—"],
    ["Valor estimado", valor === null || valor === undefined || valor === "" ? "—" : Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })],
    ["Unidade", lic?.nome_unidade_compradora || "não informada"],
    ["Nº PNCP", lic?.numero_controle_pncp || "ainda não gerado"],
    ["Publicação", lic?.data_publicacao_edital ? soData(lic.data_publicacao_edital) : "após a fase interna"],
  ]
  return (
    <details className={s.bloco}>
      <summary className={s.resumo}>
        Dados da contratação <span className={s.resumoInfo}>· {rotuloModalidade(lic?.modalidade)}{lic?.numero_edital ? ` · ${lic.numero_edital}` : ""}</span>
      </summary>
      <div className={s.corpo}>
        <dl className={s.detalhes}>
          {linhas.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className={s.acoes} style={{ marginTop: 12 }}>
          <Link href={`/orgao/processos/${licitacaoId}?detalhes=1`} className={`${s.botao} ${s.secundario}`}>
            Detalhes da licitação
          </Link>
          <span className={s.ou}>Itens, pesquisa de preços, PNCP e sessão ainda ficam lá.</span>
        </div>
      </div>
    </details>
  )
}

function rotuloStatusPeca(status: string): string {
  switch (status) {
    case "EM_ELABORACAO":
      return "Em elaboração"
    case "EM_APROVACAO":
      return "Em aprovação"
    case "EM_ASSINATURA":
      return "Em assinatura"
    case "PENDENTE":
      return "A fazer"
    default:
      return status ? status.toLowerCase().replace(/_/g, " ") : "A fazer"
  }
}

/* ---------------------------------------------------------------- Sua vez */

export function BlocoSuaVez({
  processoId,
  etapa,
  posse,
  linkTermo,
  onJuntada,
}: {
  processoId: string
  etapa: Etapa
  posse: ComQuemEsta | null
  /** Para etapa de resultado (cadastro do termo no contrato). */
  linkTermo: string | null
  onJuntada: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ehResultado = !!etapa.resultado
  const setorDaEtapa = etapa.setor_sugerido ?? null
  const etapaDeOutroSetor = !!setorDaEtapa && !!posse?.setor_id && posse.setor_id !== setorDaEtapa.id
  return (
    <section className={`${s.bloco} ${s.vez}`} aria-labelledby="bloco-sua-vez">
      <div className={s.eyebrow} id="bloco-sua-vez">
        Sua vez
      </div>
      <h2>{ehResultado ? `Etapa atual: ${etapa.rotulo}` : `Falta fazer: ${etapa.rotulo}`}</h2>
      {etapaDeOutroSetor ? (
        <div className={s.dica}>
          Esta etapa costuma ser feita por {setorDaEtapa.nome}. Se não é com você, envie o processo para lá (abaixo); se já tem a peça, junte-a aqui mesmo.
        </div>
      ) : null}
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
  etapaChave,
  posse,
  ehAvulso,
  podeEncerrar = true,
  onTramitou,
  onEncerrou,
}: {
  processoId: string
  etapaChave: string | null
  posse: ComQuemEsta | null
  ehAvulso: boolean
  /** Licitação não encerra por aqui (tem revogação/anulação próprias). */
  podeEncerrar?: boolean
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
  }, [processoId, etapaChave])

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
              Sugerido: {destinos.sugerido.setor_nome}. {destinos.sugerido.motivo}
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
            {ehAvulso && podeEncerrar ? (
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
