"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, Clock, FileText, Gavel, Loader2, RefreshCw, Upload, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL, authFetch } from "@/lib/api";

interface ItemResultado {
  itemId: string;
  numero: number;
  descricao: string;
  quantidade: number;
  unidadeMedida: string | null;
  status: string;
  valorUnitario: number | null;
  valorTotal: number | null;
  gravado: boolean;
}

interface UnidadeResultado {
  tipo: "ITEM" | "LOTE";
  unidadeId: string;
  numero: number;
  descricao: string;
  situacao: "DESERTA" | "SEM_RESULTADO" | "HOMOLOGADA" | "ADJUDICADA" | "A_ADJUDICAR" | "PENDENTE";
  vencedor: { fornecedorId: string; razaoSocial: string; cpfCnpj: string } | null;
  valorTotal: number;
  itens: ItemResultado[];
}

interface AtoResultado {
  disponivel: boolean;
  pendencias: string[];
}

type ModoFormalizacao = "REGISTRO_DIRETO" | "ASSINATURA_ELETRONICA" | "TERMO_EXTERNO";

interface RegistroFormalizacao {
  id: string;
  tipo: "ADJUDICACAO" | "HOMOLOGACAO";
  modo: ModoFormalizacao;
  status: "EFETIVADO" | "PENDENTE_ASSINATURA" | "EFETIVANDO" | "FALHOU" | "CANCELADO";
  autoridade_nome: string;
  autoridade_cargo: string;
  autoridade_ato_delegacao_numero: string | null;
  operador_nome: string;
  valor_total: number | null;
  created_at: string;
  efetivado_em: string | null;
  erro: string | null;
  tem_termo: boolean;
  tem_assinado: boolean;
  publico: boolean;
  assinatura: {
    documento_id: string;
    status: string;
    signatarios: Array<{ nome: string; status: string; interno: boolean; data_assinatura: string | null }>;
  } | null;
}

interface FormalizacaoPainel {
  modo: ModoFormalizacao;
  rotuloModo: string;
  autoridades: Array<{ id: string; nome: string; cargo: string; padrao: boolean; tem_email: boolean; tem_cpf: boolean; ato_delegacao_numero: string | null; ato_delegacao_data: string | null }>;
  autoridadePadrao: { id: string | null; nome: string; cargo: string } | null;
  operador: { pode: boolean; motivo: string | null };
  registros: RegistroFormalizacao[];
  pendente: RegistroFormalizacao | null;
}

interface PainelResultado {
  licitacao: {
    id: string;
    fase: string;
    srp: boolean;
    valor_homologado: number | null;
    data_homologacao: string | null;
    autoridade_homologacao: { nome: string; cargo: string | null } | null;
  };
  adjudicaPelaSala: boolean;
  unidades: UnidadeResultado[];
  valorAdjudicado: number;
  valorPrevia: number | null;
  atos: { adjudicar: AtoResultado | null; homologar: AtoResultado | null };
  autoridade: { nome: string; cargo: string } | null;
  formalizacao?: FormalizacaoPainel;
  instrumentos: {
    /** TERMO (E7c): leilão → termo de arrematação; concurso → termo de premiação e cessão de direitos. */
    tipo: "ATA" | "CONTRATO" | "TERMO";
    rotulo?: string;
    termos?: Array<{ id: string; titulo: string; fornecedor_razao_social: string | null; valor: number; gerado_em: string | null; status?: string }>;
    contratos: Array<{ id: string; numero_contrato: string; fornecedor_razao_social: string; valor_global: number; status: string; data_assinatura: string | null; prazo_execucao_dias: number | null }>;
    atas: Array<{ id: string; numero_ata: string; fornecedor_razao_social: string; valor_total: number; status: string }>;
  };
}

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO_SITUACAO: Record<UnidadeResultado["situacao"], { texto: string; cor: string }> = {
  HOMOLOGADA: { texto: "Homologada", cor: "bg-emerald-100 text-emerald-800" },
  ADJUDICADA: { texto: "Adjudicada", cor: "bg-blue-100 text-blue-800" },
  A_ADJUDICAR: { texto: "A adjudicar", cor: "bg-amber-100 text-amber-800" },
  PENDENTE: { texto: "Pendente", cor: "bg-slate-100 text-slate-700" },
  DESERTA: { texto: "Deserta", cor: "bg-slate-100 text-slate-500" },
  SEM_RESULTADO: { texto: "Fracassada/cancelada", cor: "bg-slate-100 text-slate-500" },
};

const ROTULO_STATUS_FORMALIZACAO: Record<RegistroFormalizacao["status"], { texto: string; cor: string }> = {
  EFETIVADO: { texto: "Efetivado", cor: "bg-emerald-100 text-emerald-800" },
  PENDENTE_ASSINATURA: { texto: "Aguardando assinatura da autoridade", cor: "bg-amber-100 text-amber-800" },
  EFETIVANDO: { texto: "Aplicando o efeito", cor: "bg-blue-100 text-blue-800" },
  FALHOU: { texto: "Assinado — efeito falhou", cor: "bg-red-100 text-red-800" },
  CANCELADO: { texto: "Cancelado", cor: "bg-slate-100 text-slate-500" },
};

const fmtDataHora = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

/** Abre um PDF protegido (com o token) numa nova aba. */
async function abrirPdf(url: string) {
  const res = await authFetch(url);
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.message || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  window.open(href, "_blank");
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/**
 * RESULTADO (plano E6 — Lei 14.133/2021 art. 71): um só painel para o órgão,
 * na sala e no cockpit. "Adjudicar" grava o vencedor HABILITADO de cada
 * unidade com os valores da proposta adequada aceita; "Homologar" calcula o
 * valor (SOMA no backend). O agente de contratação/pregoeiro REGISTRA o ato
 * em nome da AUTORIDADE escolhida (cadastro do órgão, com a padrão); o efeito
 * segue o modo do órgão: registro direto, assinatura eletrônica da autoridade
 * ou termo externo (upload do termo assinado/publicação).
 */
export function ResultadoPanel({ licitacaoId, onAtualizado }: { licitacaoId: string; onAtualizado?: () => void }) {
  const [painel, setPainel] = useState<PainelResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<"adjudicar" | "homologar" | null>(null);
  const [executando, setExecutando] = useState(false);
  const [avisoInstrumento, setAvisoInstrumento] = useState<string | null>(null);
  const [autoridadeId, setAutoridadeId] = useState<string>("");
  const [arquivoTermo, setArquivoTermo] = useState<File | null>(null);
  const [publicacaoVeiculo, setPublicacaoVeiculo] = useState("");
  const [publicacaoData, setPublicacaoData] = useState("");

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/resultado/licitacao/${licitacaoId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      setPainel(j);
      setAutoridadeId((atual) => atual || j?.formalizacao?.autoridadePadrao?.id || "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o resultado");
    } finally {
      setCarregando(false);
    }
  }, [licitacaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (ato: "adjudicar" | "homologar") => {
    setExecutando(true);
    setErro(null);
    setAvisoInstrumento(null);
    try {
      const modo = painel?.formalizacao?.modo;
      let body: BodyInit;
      if (modo === "TERMO_EXTERNO") {
        if (!arquivoTermo) throw new Error("Anexe o termo assinado pela autoridade ou a publicação no Diário Oficial.");
        const fd = new FormData();
        fd.append("termo", arquivoTermo);
        if (autoridadeId) fd.append("autoridade_id", autoridadeId);
        if (publicacaoVeiculo) fd.append("publicacao_veiculo", publicacaoVeiculo);
        if (publicacaoData) fd.append("publicacao_data", publicacaoData);
        body = fd;
      } else {
        body = JSON.stringify(autoridadeId ? { autoridade_id: autoridadeId } : {});
      }
      const res = await authFetch(`${API_URL}/api/resultado/licitacao/${licitacaoId}/${ato}`, { method: "POST", body });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const pend = Array.isArray(j?.pendencias) ? `: ${j.pendencias.join(" | ")}` : "";
        throw new Error((j?.message || `HTTP ${res.status}`) + (j?.message?.includes("Pendências") ? "" : pend));
      }
      if (ato === "homologar" && j?.instrumentos?.erro) setAvisoInstrumento(j.instrumentos.erro);
      setArquivoTermo(null);
      setPublicacaoVeiculo("");
      setPublicacaoData("");
      setDialogo(null);
      await carregar();
      onAtualizado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setExecutando(false);
    }
  };

  const previaTermo = async (ato: "adjudicar" | "homologar") => {
    setErro(null);
    try {
      const tipo = ato === "adjudicar" ? "ADJUDICACAO" : "HOMOLOGACAO";
      const q = new URLSearchParams({ tipo, ...(autoridadeId ? { autoridade_id: autoridadeId } : {}) });
      await abrirPdf(`${API_URL}/api/resultado/licitacao/${licitacaoId}/termo/previa?${q}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar o termo");
    }
  };

  const baixarTermo = async (formalizacaoId: string, versao: "termo" | "oficial") => {
    setErro(null);
    try {
      await abrirPdf(`${API_URL}/api/resultado/formalizacao/${formalizacaoId}/arquivo?versao=${versao}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao abrir o termo");
    }
  };

  const acaoFormalizacao = async (formalizacaoId: string, acao: "cancelar" | "reprocessar") => {
    setExecutando(true);
    setErro(null);
    try {
      const res = await authFetch(`${API_URL}/api/resultado/formalizacao/${formalizacaoId}/${acao}`, { method: "POST", body: "{}" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      setPainel(j);
      onAtualizado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setExecutando(false);
    }
  };

  const gerarInstrumentos = async () => {
    setExecutando(true);
    setErro(null);
    try {
      const res = await authFetch(`${API_URL}/api/resultado/licitacao/${licitacaoId}/instrumentos`, { method: "POST", body: "{}" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      setAvisoInstrumento(null);
      await carregar();
      onAtualizado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setExecutando(false);
    }
  };

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }
  if (!painel) {
    return erro ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div> : null;
  }

  const { atos } = painel;
  const homologada = painel.licitacao.fase === "HOMOLOGACAO" || !!painel.licitacao.data_homologacao;
  const total = homologada && painel.licitacao.valor_homologado != null
    ? painel.licitacao.valor_homologado
    : painel.valorAdjudicado > 0
      ? painel.valorAdjudicado
      : painel.valorPrevia ?? 0;
  const termos = painel.instrumentos.termos ?? [];
  const ehTermo = painel.instrumentos.tipo === "TERMO";
  const semInstrumento = homologada && painel.instrumentos.contratos.length === 0 && painel.instrumentos.atas.length === 0 && (!ehTermo || termos.every((t) => !t.gerado_em));
  const form = painel.formalizacao;

  return (
    <Card>
      <CardHeader className="border-b bg-slate-900 text-white">
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Resultado — adjudicação e homologação (art. 71)
        </CardTitle>
        <CardDescription className="text-slate-300">
          Vencedor habilitado de cada unidade com os valores da proposta adequada aceita. O valor homologado é a soma calculada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {avisoInstrumento && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Homologação registrada, mas o {painel.licitacao.srp ? "a ata de registro de preços" : "contrato"} não foi gerado: {avisoInstrumento}
          </div>
        )}

        <div className="space-y-2">
          {painel.unidades.map((u) => (
            <div key={u.unidadeId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {u.tipo === "LOTE" ? "Lote" : "Item"} {u.numero}
                </div>
                <Badge variant="outline" className={ROTULO_SITUACAO[u.situacao].cor}>
                  {ROTULO_SITUACAO[u.situacao].texto}
                </Badge>
              </div>
              <div className="font-medium text-slate-900">{u.descricao}</div>
              {u.vencedor ? (
                <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">
                    {u.vencedor.razaoSocial} <span className="text-xs text-slate-400">{u.vencedor.cpfCnpj}</span>
                  </span>
                  <span className="font-semibold text-emerald-700">{fmt(u.valorTotal)}</span>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-400">Sem vencedor habilitado</div>
              )}
              {u.tipo === "LOTE" && u.vencedor && (
                <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-slate-600">
                  {u.itens.map((i) => (
                    <div key={i.itemId} className="flex justify-between gap-2">
                      <span>
                        Item {i.numero} — {i.quantidade} × {fmt(i.valorUnitario)}
                      </span>
                      <span>{fmt(i.valorTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">{homologada ? "Valor homologado" : painel.valorAdjudicado > 0 ? "Valor adjudicado" : "Valor a adjudicar"}</span>
          <span className="font-semibold text-slate-900">{fmt(total)}</span>
        </div>
        {painel.licitacao.autoridade_homologacao && (
          <div className="text-xs text-slate-500">
            Homologado por {painel.licitacao.autoridade_homologacao.nome}
            {painel.licitacao.autoridade_homologacao.cargo ? ` (${painel.licitacao.autoridade_homologacao.cargo})` : ""}
            {painel.licitacao.data_homologacao ? ` em ${new Date(painel.licitacao.data_homologacao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
          </div>
        )}

        {form && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-600">
                Formalização: <b className="text-slate-900">{form.rotuloModo}</b>
              </span>
              {form.autoridadePadrao && (
                <span className="text-xs text-slate-500">
                  Autoridade padrão: {form.autoridadePadrao.nome} ({form.autoridadePadrao.cargo})
                </span>
              )}
            </div>
            {form.autoridades.length === 0 && (
              <div className="text-xs text-amber-700">
                Nenhuma autoridade cadastrada — o termo sairá com o responsável do órgão. Cadastre em Configurações › Parâmetros de licitação.
              </div>
            )}
            {form.pendente && (
              <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4" />
                  {form.pendente.tipo === "ADJUDICACAO" ? "Adjudicação" : "Homologação"} aguardando a assinatura de {form.pendente.autoridade_nome}
                </div>
                <div className="text-xs">
                  Registrada por {form.pendente.operador_nome} em {fmtDataHora(form.pendente.created_at)}. O ato só produz efeito com a assinatura
                  {form.pendente.assinatura?.signatarios?.[0]?.interno
                    ? " no Portal de Assinaturas do órgão."
                    : " pelo link enviado ao e-mail da autoridade (CPF + código)."}
                  {form.pendente.assinatura ? ` Situação do documento: ${form.pendente.assinatura.status}.` : ""}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => baixarTermo(form.pendente!.id, "termo")}>
                    <FileText className="mr-1 h-3.5 w-3.5" /> Ver termo enviado
                  </Button>
                  <a href="/orgao/portal-assinaturas" className="inline-flex items-center rounded-md border px-3 text-xs text-slate-700 hover:bg-white">
                    Portal de assinaturas
                  </a>
                  <Button size="sm" variant="outline" className="text-red-700" disabled={executando} onClick={() => acaoFormalizacao(form.pendente!.id, "cancelar")}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar pedido
                  </Button>
                </div>
              </div>
            )}
            {form.registros
              .filter((r) => r.status === "FALHOU")
              .map((r) => (
                <div key={r.id} className="space-y-1 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                  <div>
                    {r.tipo === "ADJUDICACAO" ? "Adjudicação" : "Homologação"} assinada por {r.autoridade_nome}, mas o efeito falhou: {r.erro}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={executando} onClick={() => acaoFormalizacao(r.id, "reprocessar")}>
                      Tentar de novo
                    </Button>
                    <Button size="sm" variant="outline" disabled={executando} onClick={() => acaoFormalizacao(r.id, "cancelar")}>
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}
            {form.registros.filter((r) => r.status === "EFETIVADO").length > 0 && (
              <div className="space-y-1">
                {form.registros
                  .filter((r) => r.status === "EFETIVADO")
                  .map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white px-2 py-1 text-xs">
                      <span>
                        <b>{r.tipo === "ADJUDICACAO" ? "Termo de Adjudicação" : "Termo de Adjudicação e Homologação"}</b> — {r.autoridade_nome} ({r.autoridade_cargo}
                        {r.autoridade_ato_delegacao_numero ? `, delegação ${r.autoridade_ato_delegacao_numero}` : ""}) · registrado por {r.operador_nome} em{" "}
                        {fmtDataHora(r.efetivado_em ?? r.created_at)}
                        {r.publico ? " · público" : ""}
                      </span>
                      <span className="flex gap-1">
                        {r.tem_assinado && (
                          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => baixarTermo(r.id, "oficial")}>
                            <FileText className="mr-1 h-3 w-3" /> {r.modo === "TERMO_EXTERNO" ? "Termo enviado" : "Assinado"}
                          </Button>
                        )}
                        {r.tem_termo && (
                          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => baixarTermo(r.id, "termo")}>
                            <FileText className="mr-1 h-3 w-3" /> Termo
                          </Button>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {atos.adjudicar && !homologada && (
          <div className="space-y-1">
            <Button className="w-full" onClick={() => setDialogo("adjudicar")} disabled={executando || !atos.adjudicar.disponivel}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Adjudicar
            </Button>
            {!atos.adjudicar.disponivel && atos.adjudicar.pendencias.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-amber-700">
                {atos.adjudicar.pendencias.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </div>
        )}

        {atos.homologar && !homologada && (
          <div className="space-y-1">
            <Button className="w-full bg-emerald-700 hover:bg-emerald-800" onClick={() => setDialogo("homologar")} disabled={executando || !atos.homologar.disponivel}>
              <BadgeCheck className="mr-2 h-4 w-4" />
              Homologar
            </Button>
            {!atos.homologar.disponivel && atos.homologar.pendencias.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-amber-700">
                {atos.homologar.pendencias.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </div>
        )}

        {semInstrumento && (
          <Button variant="outline" className="w-full" onClick={gerarInstrumentos} disabled={executando}>
            {executando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ehTermo ? `Gerar ${painel.instrumentos.rotulo?.toLowerCase() ?? "termo"}` : painel.licitacao.srp ? "Gerar ata de registro de preços" : "Gerar contrato(s)"}
          </Button>
        )}

        {homologada && ehTermo && termos.some((t) => t.gerado_em) && (
          <div className="space-y-1 text-sm">
            {termos.filter((t) => t.gerado_em).map((t) => (
              <div key={t.id} className="flex justify-between gap-2 rounded border px-2 py-1">
                <span>
                  {t.titulo} — {t.fornecedor_razao_social ?? "—"}
                </span>
                <span className="text-slate-500">{fmt(t.valor)}{t.status ? ` · ${t.status.toLowerCase().replace(/_/g, " ")}` : ""}</span>
              </div>
            ))}
          </div>
        )}

        {homologada && (painel.instrumentos.contratos.length > 0 || painel.instrumentos.atas.length > 0) && (
          <div className="space-y-1 text-sm">
            {painel.instrumentos.contratos.map((c) => (
              <div key={c.id} className="flex justify-between gap-2 rounded border px-2 py-1">
                <span>
                  Contrato {c.numero_contrato} — {c.fornecedor_razao_social}
                </span>
                <span className="text-slate-500">
                  {fmt(c.valor_global)} · {c.status === "AGUARDANDO_ASSINATURA" ? "aguardando assinaturas" : c.status}
                </span>
              </div>
            ))}
            {painel.instrumentos.atas.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 rounded border px-2 py-1">
                <span>
                  Ata {a.numero_ata} — {a.fornecedor_razao_social}
                </span>
                <span className="text-slate-500">{fmt(a.valor_total)} · {a.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogo !== null} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogo === "homologar" ? "Homologar o resultado" : "Adjudicar o objeto"}</DialogTitle>
            <DialogDescription>
              {dialogo === "homologar"
                ? `Ato da autoridade competente (art. 71 IV), registrado por você. ${ehTermo ? `Será gerado o ${painel.instrumentos.rotulo?.toLowerCase() ?? "termo"}.` : painel.licitacao.srp ? "Será gerada a ata de registro de preços." : "Será gerado um contrato por vencedor, aguardando as assinaturas."}`
                : ehTermo
                  ? "Cada unidade será adjudicada ao vencedor declarado (arrematação paga no leilão; trabalho vencedor qualificado no concurso), pelo valor do resultado."
                  : "Cada unidade será adjudicada ao licitante habilitado, pelos valores da proposta adequada aceita (art. 71 IV; IN SEGES 73/2022, art. 29)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {painel.unidades
              .filter((u) => u.vencedor)
              .map((u) => (
                <div key={u.unidadeId} className="flex justify-between gap-2 rounded border bg-slate-50 px-3 py-2">
                  <span>
                    {u.tipo === "LOTE" ? "Lote" : "Item"} {u.numero} — {u.vencedor?.razaoSocial}
                  </span>
                  <span className="font-medium text-emerald-700">{fmt(u.valorTotal)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total {dialogo === "homologar" ? "a homologar" : "a adjudicar"}</span>
              <span>{fmt(dialogo === "homologar" ? painel.valorAdjudicado : painel.valorPrevia ?? painel.valorAdjudicado)}</span>
            </div>
            {form && (
              <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                <div className="text-xs">
                  Ato da <b>autoridade competente</b> (art. 71, IV) — você registra no sistema e o termo sai com os dados dela.
                </div>
                {form.autoridades.length > 0 ? (
                  <label className="block text-xs">
                    Autoridade
                    <select
                      className="mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                      value={autoridadeId}
                      onChange={(e) => setAutoridadeId(e.target.value)}
                    >
                      {form.autoridades.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome} — {a.cargo}
                          {a.ato_delegacao_numero ? ` (delegação ${a.ato_delegacao_numero})` : ""}
                          {a.padrao ? " · padrão" : ""}
                          {form.modo === "ASSINATURA_ELETRONICA" && !a.tem_email ? " · sem e-mail" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  form.autoridadePadrao && (
                    <div>
                      Autoridade: <b>{form.autoridadePadrao.nome}</b> — {form.autoridadePadrao.cargo}
                    </div>
                  )
                )}
                <div className="text-xs">
                  {form.modo === "ASSINATURA_ELETRONICA"
                    ? "Assinatura eletrônica: o termo vai para a autoridade assinar; o ato só produz efeito depois da assinatura."
                    : form.modo === "TERMO_EXTERNO"
                      ? "Termo externo: anexe o termo assinado pela autoridade ou a publicação no Diário Oficial — o efeito é imediato."
                      : "Registro direto: efeito imediato; o termo é gerado com os dados da autoridade."}
                </div>
                {form.modo === "TERMO_EXTERNO" && (
                  <div className="space-y-2">
                    <label className="block text-xs">
                      <span className="flex items-center gap-1">
                        <Upload className="h-3.5 w-3.5" /> Termo assinado / publicação (PDF, PNG ou JPG, até 20 MB)
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        className="mt-1 block w-full text-xs"
                        onChange={(e) => setArquivoTermo(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs">
                        Veículo da publicação (opcional)
                        <input
                          className="mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-slate-900"
                          value={publicacaoVeiculo}
                          onChange={(e) => setPublicacaoVeiculo(e.target.value)}
                          placeholder="Diário Oficial do Município"
                        />
                      </label>
                      <label className="block text-xs">
                        Data da publicação
                        <input
                          type="date"
                          className="mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-sm text-slate-900"
                          value={publicacaoData}
                          onChange={(e) => setPublicacaoData(e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={() => dialogo && previaTermo(dialogo)}>
                  <FileText className="mr-1 h-3.5 w-3.5" /> Gerar termo (prévia)
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={executando}>
              Cancelar
            </Button>
            <Button
              className={dialogo === "homologar" ? "bg-emerald-700 hover:bg-emerald-800" : undefined}
              disabled={executando || (form?.modo === "TERMO_EXTERNO" && !arquivoTermo)}
              onClick={() => dialogo && executar(dialogo)}
            >
              {executando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {form?.modo === "ASSINATURA_ELETRONICA"
                ? "Enviar para assinatura da autoridade"
                : dialogo === "homologar"
                  ? "Confirmar homologação"
                  : "Confirmar adjudicação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
