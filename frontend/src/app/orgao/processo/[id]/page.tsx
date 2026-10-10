"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  chamarProcessos,
  normalizarPosse,
  rotuloDoTipo,
  temTramitacaoPropria,
  textoDoErro,
  type Autos,
  type ComQuemEsta,
  type Fluxo,
  type ProcessoVisao,
  type Tramitacao,
  type ConteudoLicitacao,
} from "@/lib/processo/processo"
import {
  BlocoAguardando,
  BlocoEnviar,
  BlocoEstaCom,
  BlocoEtapas,
  BlocoPecaAvulsa,
  BlocoResultado,
  BlocoSuaVez,
  BlocoSuaVezLicitacao,
  BlocoPublicacaoLicitacao,
  BlocoDadosLicitacao,
  SecaoDetalhes,
  SecaoLinhaDoTempo,
  TemaProcesso,
  estilos as s,
} from "@/components/processo/BlocosProcesso"
import { AndamentoFluxo } from "@/components/fluxo/AndamentoFluxo"
import { BlocoOficio, BlocoProvidenciaOficio } from "@/components/processo/BlocoOficio"
import { PainelEtapaFluxo } from "@/components/fluxo/PainelEtapaFluxo"
import { ProcessoContratacaoFluxo } from "@/components/processo/ProcessoContratacaoFluxo"
import { haQuantoTempo, type Andamento } from "@/lib/fluxo/andamento"

/**
 * Tela do processo (genérica): mostra ONDE o processo está e o PRÓXIMO PASSO.
 * Linha do tempo e detalhes ficam recolhidos. CONTRATACAO é só leitura (a licitação
 * tem tela própria em /orgao/processos/[id]).
 */
export default function TelaDoProcessoPage() {
  const params = useParams()
  const id = params.id as string

  const [processo, setProcesso] = useState<ProcessoVisao | null>(null)
  const [tram, setTram] = useState<Tramitacao | null>(null)
  const [posse, setPosse] = useState<ComQuemEsta | null>(null)
  const [fluxo, setFluxo] = useState<Fluxo | null>(null)
  const [autos, setAutos] = useState<Autos | null>(null)
  const [andamento, setAndamento] = useState<Andamento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [recebendo, setRecebendo] = useState(false)
  const [erroReceber, setErroReceber] = useState<string | null>(null)
  const tentativasPosse = useRef(0)

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      setErro(null)
      try {
        const p = await chamarProcessos<ProcessoVisao>(`/${id}`, { padrao: "Não foi possível abrir o processo." })
        setProcesso(p)
        // Andamento é complemento: se falhar, a tela segue sem ele
        chamarProcessos<Andamento>(`/${id}/andamento`).then(setAndamento).catch(() => setAndamento(null))
        if (temTramitacaoPropria(p.tipo)) {
          const [t, f, a] = await Promise.all([
            chamarProcessos<Tramitacao>(`/${id}/tramitacao`),
            chamarProcessos<Fluxo>(`/${id}/fluxo`),
            chamarProcessos<Autos>(`/${id}/autos`),
          ])
          setTram(t)
          setPosse(t.com_quem_esta ? normalizarPosse(t.com_quem_esta) : null)
          setFluxo(f)
          setAutos(a)
        } else if (p.tipo === "CONTRATACAO" && p.referencia_id) {
          // Licitação: tramitação e etapas pelo motor da fase interna (adaptadores); os autos ficam na tela da licitação
          const [t, f] = await Promise.all([
            chamarProcessos<Tramitacao>(`/${id}/tramitacao`).catch(() => null),
            chamarProcessos<Fluxo>(`/${id}/fluxo`).catch(() => null),
          ])
          setTram(t)
          setPosse(normalizarPosse(t?.com_quem_esta))
          setFluxo(f)
          setAutos(null)
          // Processo recém-aberto: a autuação automática leva alguns segundos; relê até aparecer a posse
          if (!normalizarPosse(t?.com_quem_esta) && tentativasPosse.current < 4) {
            tentativasPosse.current += 1
            setTimeout(() => carregar(true), 2500)
          }
        } else {
          const t = await chamarProcessos<{ com_quem_esta?: unknown }>(`/${id}/tramitacao`).catch(() => null)
          setTram(null)
          setPosse(normalizarPosse(t?.com_quem_esta))
          setFluxo(null)
          setAutos(null)
        }
      } catch (e) {
        setErro(textoDoErro(e, "Não foi possível abrir o processo."))
      } finally {
        setCarregando(false)
      }
    },
    [id],
  )

  useEffect(() => {
    carregar()
  }, [carregar])

  async function receber() {
    setRecebendo(true)
    setErroReceber(null)
    try {
      await chamarProcessos(`/${id}/receber`, { metodo: "POST", padrao: "Não foi possível receber o processo." })
      await carregar(true)
    } catch (e) {
      setErroReceber(textoDoErro(e, "Não foi possível receber o processo."))
    } finally {
      setRecebendo(false)
    }
  }

  if (carregando && !processo) {
    return (
      <TemaProcesso>
        <p className={s.vazio} role="status">
          Carregando o processo...
        </p>
      </TemaProcesso>
    )
  }

  if (erro || !processo) {
    return (
      <TemaProcesso>
        <div className={s.cabecalho}>
          <div className={s.trilha}>
            <Link href="/orgao/processo">Processos</Link>
          </div>
        </div>
        <div className={s.bloco}>
          <div className={s.erro} role="alert">
            {erro || "Processo não encontrado."}
          </div>
          <div className={s.acoes} style={{ marginTop: 12 }}>
            <button type="button" className={`${s.botao} ${s.secundario}`} onClick={() => carregar()}>
              Tentar de novo
            </button>
            <Link href="/orgao/processo" className={`${s.botao} ${s.secundario}`}>
              Voltar para a lista
            </Link>
          </div>
        </div>
      </TemaProcesso>
    )
  }

  const encerrado = processo.situacao === "ENCERRADO"
  const propria = temTramitacaoPropria(processo.tipo)
  // Ofício segue como avulso depois de assinado (receber, responder, encaminhar, arquivar)
  const ehOficio = processo.tipo === "OFICIO"
  const oficioPendente = ehOficio && !!autos && !autos.juntadas.some((j) => j.tipo_peca === "OFICIO")
  const ehAvulso = processo.tipo === "AVULSO" || ehOficio
  const oficioJaEnviado = ehOficio && !!tram?.movimentacoes?.some((m) => m.tipo !== "ABERTURA")
  // Com fluxo em andamento o processo anda pelas etapas: sem envio, devolução ou encerramento à mão
  const fluxoEmAndamento = andamento?.modo === "FLUXO" && !andamento.encerrado
  // Selo do cabeçalho (mockup): onde está e há quanto tempo — "ETP · Setor de Compras · há 3 dias" / "No Setor de Patrimônio · há 2 dias"
  const ondeEsta = !encerrado && andamento?.atual
    ? andamento.modo === "FLUXO"
      ? [andamento.atual.titulo, andamento.atual.responsavel, haQuantoTempo(andamento.atual.desde)].filter(Boolean).join(" · ")
      : [andamento.atual.titulo === "Aguardando recebimento" ? `Aguardando recebimento em ${andamento.atual.responsavel ?? ""}`.trim() : `No ${andamento.atual.responsavel ?? "órgão"}`, haQuantoTempo(andamento.atual.desde)].filter(Boolean).join(" · ")
    : null
  const ehLicitacao = processo.tipo === "CONTRATACAO" && !!processo.referencia_id
  const temFluxo = !!fluxo?.disponivel && !!fluxo.tem_fluxo && !!fluxo.etapas?.length
  const etapaAtual = temFluxo ? fluxo?.etapa_atual ?? null : null
  const podeAgir = !!tram?.pode_agir && !encerrado
  const podeReceber = !!tram?.pode_receber && !encerrado
  const resultadoDeTermo = temFluxo && (processo.tipo === "ADITIVO" || processo.tipo === "RENOVACAO")

  const linkTermo = processo.contrato_id ? `/orgao/contratos/${processo.contrato_id}?tab=termos&processo_id=${processo.id}` : null

  const contrato = processo.conteudo?.contrato ?? null
  const licitacao = ehLicitacao && processo.conteudo && "modalidade" in processo.conteudo ? (processo.conteudo as ConteudoLicitacao) : null

  // Contratação que segue o fluxo (mockup "Processo enxuto", 10/10/2026): onde está, com quem e uma ação
  if (ehLicitacao && andamento?.modo === "FLUXO" && andamento.licitacao_id) {
    return (
      <TemaProcesso>
        <ProcessoContratacaoFluxo
          processo={processo}
          licitacao={licitacao}
          andamento={andamento}
          posse={posse}
          podeReceber={podeReceber}
          onReceber={receber}
          recebendo={recebendo}
          erroReceber={erroReceber}
          linhaDoTempo={(tram?.linha_do_tempo as unknown[] | undefined) ?? []}
          onAtualizar={() => carregar(true)}
        />
      </TemaProcesso>
    )
  }

  return (
    <TemaProcesso>
      <header className={s.cabecalho}>
        <div className={s.trilha}>
          <Link href="/orgao/processo">Processos</Link> / {processo.numero}
        </div>
        <h1>{processo.objeto}</h1>
        <div className={s.meta}>
          <span className={s.tipo}>{rotuloDoTipo(processo.tipo)}</span>
          <span>Processo nº {processo.numero}</span>
          <span className={`${s.chip} ${encerrado ? s.chipOk : s.chipEspera}`}>{encerrado ? "Encerrado" : "Em andamento"}</span>
          {ondeEsta ? <span className={s.chip}>{ondeEsta}</span> : null}
          {processo.contrato_id ? (
            <Link className={s.link} href={`/orgao/contratos/${processo.contrato_id}`}>
              Contrato {contrato?.numero_contrato ?? "vinculado"}
              {contrato?.fornecedor_razao_social ? ` · ${contrato.fornecedor_razao_social}` : ""}
            </Link>
          ) : null}
        </div>
      </header>

      <AndamentoFluxo andamento={andamento} />

      {andamento?.modo === "FLUXO" ? <PainelEtapaFluxo processoId={processo.id} andamento={andamento} onAtualizar={() => carregar(true)} /> : null}

      <BlocoEstaCom
        posse={posse}
        encerrado={encerrado}
        podeReceber={podeReceber}
        onReceber={receber}
        recebendo={recebendo}
        erro={erroReceber}
      />

      {ehLicitacao ? (
        fluxoEmAndamento ? null : encerrado ? (
          <BlocoAguardando posse={posse} encerrado motivo={processo.motivo_encerramento} />
        ) : podeAgir ? (
          <>
            <BlocoSuaVezLicitacao processoId={processo.id} licitacaoId={processo.referencia_id!} etapa={etapaAtual} onFeito={() => carregar(true)} />
            <BlocoEnviar
              processoId={processo.id}
              etapaChave={etapaAtual?.chave ?? null}
              posse={posse}
              ehAvulso={false}
              podeEncerrar={false}
              onTramitou={() => carregar(true)}
              onEncerrou={() => carregar(true)}
            />
          </>
        ) : (
          <BlocoAguardando posse={posse} encerrado={false} motivo={null} />
        )
      ) : !propria ? (
        <section className={`${s.bloco} ${s.neutro}`}>
          <div className={s.eyebrow}>Processo</div>
          <h2>Este tipo de processo ainda não tramita por aqui</h2>
          <p>A tramitação deste tipo entra numa próxima etapa do processo eletrônico.</p>
        </section>
      ) : encerrado ? (
        <BlocoAguardando posse={posse} encerrado motivo={processo.motivo_encerramento} />
      ) : fluxoEmAndamento ? null : podeAgir && oficioPendente ? (
        <BlocoOficio processoId={processo.id} onEnviado={() => carregar(true)} />
      ) : podeAgir && ehOficio && oficioJaEnviado ? (
        <BlocoProvidenciaOficio
          processoId={processo.id}
          remetente={tram?.atual ? { setor_id: tram.atual.de_setor_id, setor_nome: tram.atual.de_setor_nome } : null}
          posse={posse}
          onFeito={() => carregar(true)}
        />
      ) : podeAgir ? (
        <>
          {andamento?.modo === "FLUXO" ? null : temFluxo && etapaAtual ? (
            <BlocoSuaVez key={etapaAtual.chave} processoId={processo.id} etapa={etapaAtual} posse={posse} linkTermo={linkTermo} onJuntada={() => carregar(true)} />
          ) : ehAvulso ? (
            <BlocoPecaAvulsa processoId={processo.id} onJuntada={() => carregar(true)} />
          ) : null}
          <BlocoEnviar
            processoId={processo.id}
            etapaChave={etapaAtual?.chave ?? null}
            posse={posse}
            ehAvulso={ehAvulso}
            onTramitou={() => carregar(true)}
            onEncerrou={() => carregar(true)}
          />
        </>
      ) : (
        <BlocoAguardando posse={posse} encerrado={false} motivo={null} />
      )}

      {(propria || ehLicitacao) && andamento?.modo !== "FLUXO" ? <BlocoEtapas fluxo={fluxo} /> : null}
      {ehLicitacao && !encerrado ? <BlocoPublicacaoLicitacao licitacaoId={processo.referencia_id!} modalidade={licitacao?.modalidade ?? null} /> : null}
      {ehLicitacao ? <BlocoDadosLicitacao licitacaoId={processo.referencia_id!} lic={licitacao} /> : null}

      {resultadoDeTermo ? <BlocoResultado processo={processo} etapaAtual={etapaAtual} linkTermo={linkTermo} /> : null}

      {propria ? <SecaoLinhaDoTempo eventos={tram?.linha_do_tempo ?? []} /> : null}
      {propria ? <SecaoDetalhes processo={processo} autos={autos} /> : null}
    </TemaProcesso>
  )
}
