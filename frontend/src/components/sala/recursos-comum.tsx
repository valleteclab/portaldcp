"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, FileText, Gavel, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { API_URL, authFetch } from "@/lib/api";

/**
 * Tipos e peças comuns dos painéis de RECURSO (plano E5 — Lei 14.133/2021
 * art. 165; IN SEGES 73/2022 art. 40): o do agente/autoridade (RecursosPanel)
 * e o do licitante (RecursosFornecedorPanel). A regra (prazos, quem pode o
 * quê, efeitos) é do backend — /api/recursos/sessao/:id; a tela só mostra e
 * pede os atos.
 */

export interface ArquivoMeta {
  nome: string;
  mime?: string | null;
  tamanho?: number | null;
  sha256?: string | null;
}

export interface Contrarrazao {
  id: string;
  fornecedorId: string;
  nome: string;
  texto: string;
  apresentadaEm: string;
  arquivo: ArquivoMeta | null;
}

export interface AlteracaoEfeito {
  fornecedor_id: string;
  unidade_id: string;
  rotulo: string;
  de: string | null;
  para: string;
  tipo: "RESTAURADO" | "INVALIDADO" | "EXCLUIDO";
}

export interface Recurso {
  id: string;
  status: string;
  atoRecorrido: string;
  atoRecorridoRotulo: string;
  recorrente: { id: string; nome: string };
  alvo: { id: string; nome: string } | null;
  unidade: { id: string; tipo: string; rotulo: string } | null;
  motivacao: string | null;
  dataIntencao: string | null;
  motivoNaoAdmissao: string | null;
  pressupostoAusente: string | null;
  motivoNaoConhecimento: string | null;
  razoes: string | null;
  dataRazoes: string | null;
  prazoRazoes: string | null;
  razoesArquivo: ArquivoMeta | null;
  prazoContrarrazoes: string | null;
  contrarrazoes: Contrarrazao[];
  prazoReconsideracao: string | null;
  reconsideracao: { resultado: string; fundamentacao: string; em: string; por: string | null } | null;
  encaminhadoEm: string | null;
  prazoDecisaoAutoridade: string | null;
  decisao: string | null;
  decididoPor: string | null;
  decididoPorCargo: string | null;
  instanciaDecisao: string | null;
  dataDecisao: string | null;
  efeitos: {
    automatico?: boolean;
    alteracoes?: AlteracaoEfeito[];
    aceitacoes_canceladas?: string[];
    alterou_resultado?: boolean;
    observacao?: string | null;
    ato_fase?: string | null;
  } | null;
  reconsideracaoAtrasada: boolean;
  autoridadeAtrasada: boolean;
  // visão do licitante
  souRecorrente?: boolean;
  podeApresentarRazoes?: boolean;
  podeContrarrazoar?: boolean;
  minhaContrarrazao?: string | null;
  // visão do órgão
  podeAdmitir?: boolean;
  podeReconsiderar?: boolean;
  podeDecidirAutoridade?: boolean;
}

export interface Janela {
  id: string;
  abertaEm: string;
  fechaEm: string;
  minutos: number;
  estado: "ABERTA" | "ENCERRADA" | "SUPERADA";
  segundosRestantes: number;
}

export interface PainelRecursos {
  sessaoId: string;
  licitacaoId: string;
  faseLicitacao: string | null;
  etapa: string;
  prazos: { minutosIntencao: number; diasRazoes: number; diasContrarrazoes: number };
  janela: Janela | null;
  pendentes: number;
  recursos: Recurso[];
  podeAbrirJanela?: boolean;
  motivoNaoAbreJanela?: string | null;
  podeManifestarIntencao?: boolean;
  atosRecorriveis?: Array<{ ato: string; rotulo: string; unidadeId: string | null; fornecedorAlvoId: string | null }>;
}

export const STATUS_RECURSO: Record<string, { label: string; cls: string }> = {
  INTENCAO: { label: "Intenção — aguarda admissibilidade", cls: "bg-slate-100 text-slate-700" },
  AGUARDANDO_RAZOES: { label: "Prazo de razões", cls: "bg-amber-100 text-amber-800" },
  RAZOES_APRESENTADAS: { label: "Contrarrazões", cls: "bg-blue-100 text-blue-700" },
  CONTRARRAZOES: { label: "Prazo de contrarrazões", cls: "bg-blue-100 text-blue-700" },
  EM_ANALISE: { label: "Reconsideração do agente", cls: "bg-purple-100 text-purple-700" },
  AGUARDANDO_AUTORIDADE: { label: "Com a autoridade superior", cls: "bg-indigo-100 text-indigo-700" },
  PROVIDO: { label: "Provido", cls: "bg-green-100 text-green-700" },
  IMPROVIDO: { label: "Improvido", cls: "bg-red-100 text-red-700" },
  NAO_CONHECIDO: { label: "Não conhecido", cls: "bg-red-100 text-red-600" },
};

export const PRESSUPOSTOS: Array<{ valor: string; rotulo: string }> = [
  { valor: "LEGITIMIDADE", rotulo: "Legitimidade (não é licitante / ato de outro)" },
  { valor: "INTERESSE", rotulo: "Interesse recursal (sem prejuízo ao recorrente)" },
  { valor: "MOTIVACAO", rotulo: "Motivação (intenção sem indicar o ato e a razão)" },
  { valor: "TEMPESTIVIDADE", rotulo: "Tempestividade" },
];

export const dataHoraBr = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Contagem regressiva (mm:ss ou hh:mm:ss) até `fim`. */
export function useContagem(fim?: string | null): { texto: string; segundos: number } {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!fim) return;
    const iv = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [fim]);
  const s = fim ? Math.max(0, Math.floor((new Date(fim).getTime() - agora) / 1000)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return { texto: h > 0 ? `${p(h)}:${p(m)}:${p(seg)}` : `${p(m)}:${p(seg)}`, segundos: s };
}

/** Baixa um arquivo protegido (token) e abre numa aba. */
export async function baixarArquivo(url: string, nome: string) {
  const res = await authFetch(url);
  if (!res.ok) throw new Error("Arquivo indisponível");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  a.target = "_blank";
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function LinkArquivo({ url, arquivo }: { url: string; arquivo: ArquivoMeta }) {
  const [erro, setErro] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs text-blue-700 underline-offset-2 hover:underline"
      onClick={() => baixarArquivo(url, arquivo.nome).catch(() => setErro(true))}
      title={arquivo.sha256 ? `SHA-256 ${arquivo.sha256}` : undefined}
    >
      <Download className="h-3 w-3" /> {arquivo.nome}
      {erro && <span className="text-red-600"> (indisponível)</span>}
    </button>
  );
}

export function BadgeStatusRecurso({ status }: { status: string }) {
  const st = STATUS_RECURSO[status] || { label: status, cls: "bg-slate-100" };
  return <Badge className={`${st.cls} border-0 text-[10px]`}>{st.label}</Badge>;
}

/** Leitura do recurso: intenção, razões, contrarrazões, reconsideração, decisão e efeitos. */
export function DetalheRecurso({ r }: { r: Recurso }) {
  return (
    <div className="space-y-2 text-xs text-slate-700">
      <div className="text-slate-500">
        {r.atoRecorridoRotulo}
        {r.alvo ? ` — ${r.alvo.nome}` : ""}
        {r.unidade ? ` (${r.unidade.rotulo})` : ""} · intenção em {dataHoraBr(r.dataIntencao)}
      </div>
      {r.motivacao && (
        <div className="rounded bg-slate-50 p-2">
          <strong>Motivação da intenção:</strong> {r.motivacao}
        </div>
      )}
      {r.motivoNaoAdmissao && (
        <div className="rounded bg-red-50 p-2 text-red-700">
          <strong>Não admitida</strong>
          {r.pressupostoAusente ? ` (${r.pressupostoAusente.toLowerCase()})` : ""}: {r.motivoNaoAdmissao}
        </div>
      )}
      {r.motivoNaoConhecimento && <div className="rounded bg-red-50 p-2 text-red-700">{r.motivoNaoConhecimento}</div>}
      {(r.prazoRazoes || r.prazoContrarrazoes) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
          {r.prazoRazoes && <span>Razões até {dataHoraBr(r.prazoRazoes)}</span>}
          {r.prazoContrarrazoes && <span>Contrarrazões até {dataHoraBr(r.prazoContrarrazoes)}</span>}
          {r.prazoReconsideracao && <span>Reconsideração até {dataHoraBr(r.prazoReconsideracao)}</span>}
          {r.prazoDecisaoAutoridade && <span>Autoridade até {dataHoraBr(r.prazoDecisaoAutoridade)}</span>}
        </div>
      )}
      {(r.reconsideracaoAtrasada || r.autoridadeAtrasada) && (
        <div className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 p-2 text-amber-800">
          <AlertTriangle className="h-3 w-3" />
          {r.reconsideracaoAtrasada
            ? "Prazo de reconsideração do agente vencido (art. 165 §2º)."
            : "Prazo de decisão da autoridade superior vencido (art. 165 §2º)."}
        </div>
      )}
      {r.razoes && (
        <div className="rounded bg-slate-50 p-2">
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <FileText className="h-3 w-3" /> Razões de {r.recorrente.nome} ({dataHoraBr(r.dataRazoes)})
          </div>
          <div className="whitespace-pre-wrap">{r.razoes}</div>
          {r.razoesArquivo && <LinkArquivo url={`${API_URL}/api/recursos/${r.id}/razoes/arquivo`} arquivo={r.razoesArquivo} />}
        </div>
      )}
      {r.contrarrazoes.map((c) => (
        <div key={c.id} className="rounded bg-blue-50 p-2">
          <div className="mb-1 font-semibold">
            Contrarrazões de {c.nome} ({dataHoraBr(c.apresentadaEm)})
          </div>
          <div className="whitespace-pre-wrap">{c.texto}</div>
          {c.arquivo && <LinkArquivo url={`${API_URL}/api/recursos/${r.id}/contrarrazoes/${c.id}/arquivo`} arquivo={c.arquivo} />}
        </div>
      ))}
      {r.reconsideracao && (
        <div className="rounded bg-purple-50 p-2">
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <Scale className="h-3 w-3" />
            {r.reconsideracao.resultado === "RECONSIDERADO" ? "Reconsiderado pelo agente" : "Decisão mantida pelo agente e encaminhada à autoridade superior"}
            {r.reconsideracao.por ? ` — ${r.reconsideracao.por}` : ""} ({dataHoraBr(r.reconsideracao.em)})
          </div>
          <div className="whitespace-pre-wrap">{r.reconsideracao.fundamentacao}</div>
        </div>
      )}
      {r.decisao && r.instanciaDecisao === "AUTORIDADE" && (
        <div className="rounded bg-slate-100 p-2">
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <Gavel className="h-3 w-3" /> Decisão da autoridade superior — {r.decididoPor}
            {r.decididoPorCargo ? `, ${r.decididoPorCargo}` : ""} ({dataHoraBr(r.dataDecisao)})
          </div>
          <div className="whitespace-pre-wrap">{r.decisao}</div>
        </div>
      )}
      {r.decisao && r.instanciaDecisao === "LEGADO" && (
        <div className="rounded bg-slate-100 p-2">
          <strong>Decisão (registro anterior):</strong> {r.decisao}
          {r.decididoPor ? ` — ${r.decididoPor}` : ""}
        </div>
      )}
      {r.status === "PROVIDO" && r.efeitos && (
        <div className="rounded border border-green-200 bg-green-50 p-2 text-green-900">
          <div className="mb-1 font-semibold">Efeitos do provimento (art. 165 §3º)</div>
          {r.efeitos.automatico === false ? (
            <div>{r.efeitos.observacao}</div>
          ) : (
            <ul className="list-inside list-disc space-y-0.5">
              {(r.efeitos.alteracoes ?? []).map((a, i) => (
                <li key={i}>
                  {a.rotulo}: {a.tipo === "RESTAURADO" ? "restaurado" : a.tipo === "INVALIDADO" ? "ato invalidado" : "excluído"} —{" "}
                  {a.fornecedor_id === r.recorrente.id ? r.recorrente.nome : a.fornecedor_id === r.alvo?.id ? r.alvo?.nome : "licitante"} (
                  {a.de ?? "—"} → {a.para})
                </li>
              ))}
              {!!r.efeitos.aceitacoes_canceladas?.length && (
                <li>{r.efeitos.aceitacoes_canceladas.length} aceitação(ões) de proposta invalidada(s)</li>
              )}
              {r.efeitos.ato_fase && (
                <li>
                  Fase:{" "}
                  {r.efeitos.ato_fase === "RETORNAR_JULGAMENTO"
                    ? "volta ao julgamento (nova aceitação)"
                    : r.efeitos.ato_fase === "RETORNAR_HABILITACAO"
                      ? "volta à habilitação com o novo resultado"
                      : "segue para a adjudicação"}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
