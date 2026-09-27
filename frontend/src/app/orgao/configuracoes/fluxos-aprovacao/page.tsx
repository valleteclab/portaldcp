"use client";

/**
 * FLUXOS DE APROVAÇÃO (conferência interna das peças da fase interna).
 *
 *  - explica em linguagem simples para que serve e quando vale (só nas etapas
 *    com "aprovação interna" ligada no modelo de fluxo — lista quais estão);
 *  - modelos prontos (dados do servidor): "Usar este modelo" abre o editor já
 *    preenchido; o órgão escolhe o setor/pessoa de cada etapa (obrigatório);
 *  - fluxos do órgão: um fluxo pode valer para várias peças; sem peça marcada
 *    = GENÉRICO (vale para todas as peças sem fluxo próprio).
 * Fontes: GET /api/fase-interna/fluxos-aprovacao, …/modelos-prontos, …/cobertura.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  Info,
  Loader2,
  PenLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_URL, authFetch } from "@/lib/api";
import { confirmarAcao } from "@/components/DialogoGlobal";

interface Setor {
  id: string;
  codigo?: string;
  nome: string;
}

interface Usuario {
  id: string;
  nome?: string;
  email?: string;
  ativo?: boolean;
}

interface EtapaFluxo {
  ordem: number;
  nome: string;
  descricao?: string;
  setor_id?: string | null;
  setor_nome?: string | null;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  exige_assinatura: boolean;
  sugestao_responsavel?: string | null;
}

interface TipoTitulo {
  tipo: string;
  titulo: string;
}

interface FluxoAprovacao {
  id: string;
  nome: string;
  tipo_documento: string | null;
  tipos: string[];
  tipos_titulos: TipoTitulo[];
  generico: boolean;
  modelo_origem: string | null;
  etapas: EtapaFluxo[];
  ativo: boolean;
}

interface ModeloPronto {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  tipos_titulos: TipoTitulo[];
  etapas: Array<{ ordem: number; nome: string; exige_assinatura: boolean; sugestao_responsavel: string }>;
  rascunho: { nome: string; tipos_documento: string[]; modelo_origem: string; etapas: EtapaFluxo[] };
}

interface Cobertura {
  alguma_ligada: boolean;
  pecas: TipoTitulo[];
  tela_modelo_fluxo: string;
  tipos: Array<{
    tipo: string;
    rotulo: string;
    etapas: Array<{ codigo: string; titulo: string; pecas: Array<{ tipo: string; titulo: string; fluxo: { id: string; nome: string; generico: boolean } | null }> }>;
  }>;
}

/** Rascunho editável (novo, a partir de modelo ou existente). */
type Rascunho = {
  id?: string;
  nome: string;
  tipos: string[];
  modelo_origem: string | null;
  etapas: EtapaFluxo[];
};

const NENHUM = "__nenhum__";

function ehAdminDoOrgao(): boolean {
  try {
    const u = localStorage.getItem("usuario");
    if (!u) return true; // login do próprio órgão
    return JSON.parse(u)?.role === "ADMIN";
  } catch {
    return false;
  }
}

function getOrgaoId(): string | undefined {
  try {
    const o = JSON.parse(localStorage.getItem("orgao") || "{}")?.id;
    if (o) return o;
    return JSON.parse(localStorage.getItem("usuario") || "{}")?.orgao_id;
  } catch {
    return undefined;
  }
}

async function mensagemDeErro(res: Response): Promise<string> {
  const d = await res.json().catch(() => null);
  const m = d?.message;
  return Array.isArray(m) ? m.join(" ") : m || `Erro ${res.status}`;
}

/** Etapa sem setor e sem pessoa. */
const semResponsavel = (e: EtapaFluxo) => !e.setor_id && !e.usuario_id;

export default function FluxosAprovacaoPage() {
  const [fluxos, setFluxos] = useState<FluxoAprovacao[]>([]);
  const [modelos, setModelos] = useState<ModeloPronto[]>([]);
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [admin, setAdmin] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const orgaoId = getOrgaoId();
    try {
      const [rF, rM, rC, rS, rU] = await Promise.all([
        authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao`),
        authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao/modelos-prontos`),
        authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao/cobertura`),
        orgaoId ? authFetch(`${API_URL}/api/orgaos/${orgaoId}/setores`) : Promise.resolve(null),
        authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios`),
      ]);
      if (rF.ok) setFluxos(((await rF.json()) as FluxoAprovacao[]).filter((f) => f.ativo));
      if (rM.ok) setModelos(await rM.json());
      if (rC.ok) setCobertura(await rC.json());
      if (rS?.ok) {
        const d = await rS.json();
        setSetores(Array.isArray(d) ? d : d?.setores || []);
      }
      if (rU.ok) setUsuarios(((await rU.json()) as Usuario[]).filter((u) => u.ativo !== false));
    } catch {
      toast.error("Erro ao carregar os fluxos de aprovação");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAdmin(ehAdminDoOrgao());
    carregar();
  }, [carregar]);

  const pecas = cobertura?.pecas ?? [];
  const tituloPeca = useCallback((t: string) => pecas.find((p) => p.tipo === t)?.titulo ?? t, [pecas]);

  const abrirEditor = (r: Rascunho) => {
    setTentouSalvar(false);
    setEditando(r);
  };

  const novoFluxo = () =>
    abrirEditor({ nome: "", tipos: [], modelo_origem: null, etapas: [{ ordem: 1, nome: "", exige_assinatura: false }] });

  const usarModelo = (m: ModeloPronto) =>
    abrirEditor({
      nome: m.rascunho.nome,
      tipos: [...m.rascunho.tipos_documento],
      modelo_origem: m.rascunho.modelo_origem,
      etapas: m.rascunho.etapas.map((e) => ({ ...e, setor_id: null, usuario_id: null })),
    });

  const editarFluxo = (f: FluxoAprovacao) =>
    abrirEditor({
      id: f.id,
      nome: f.nome,
      tipos: [...f.tipos],
      modelo_origem: f.modelo_origem,
      etapas: [...(f.etapas || [])].sort((a, b) => a.ordem - b.ordem),
    });

  const remover = async (f: FluxoAprovacao) => {
    if (!(await confirmarAcao({ titulo: "Remover fluxo", mensagem: `Remover o fluxo "${f.nome}"? As peças já em aprovação continuam; as próximas usam outro fluxo (ou a aprovação única).`, destrutivo: true }))) return;
    const res = await authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao/${f.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Fluxo removido");
      carregar();
    } else toast.error(await mensagemDeErro(res));
  };

  /** Problemas do rascunho (o servidor confere de novo). */
  const problemas = useMemo(() => {
    if (!editando) return [] as string[];
    const p: string[] = [];
    if (!editando.nome.trim()) p.push("Dê um nome ao fluxo.");
    if (!editando.etapas.length) p.push("O fluxo precisa de pelo menos uma etapa.");
    editando.etapas.forEach((e, i) => {
      if (!e.nome.trim()) p.push(`Etapa ${i + 1}: dê um nome.`);
      if (editando.modelo_origem && semResponsavel(e)) p.push(`Etapa ${i + 1}: escolha o setor ou a pessoa.`);
      if (e.exige_assinatura && i !== editando.etapas.length - 1) p.push(`Etapa ${i + 1}: só a última etapa pode exigir assinatura.`);
    });
    return p;
  }, [editando]);

  const salvar = async () => {
    if (!editando) return;
    setTentouSalvar(true);
    if (problemas.length) {
      toast.error(problemas[0]);
      return;
    }
    const payload = {
      nome: editando.nome.trim(),
      tipo_documento: editando.tipos[0] ?? null,
      tipos_documento: editando.tipos.length ? editando.tipos : null,
      modelo_origem: editando.modelo_origem,
      etapas: editando.etapas.map((e, i) => ({
        ordem: i + 1,
        nome: e.nome.trim(),
        descricao: e.descricao,
        setor_id: e.setor_id || null,
        usuario_id: e.usuario_id || null,
        exige_assinatura: !!e.exige_assinatura,
        sugestao_responsavel: e.sugestao_responsavel || undefined,
      })),
    };
    setSalvando(true);
    try {
      const res = editando.id
        ? await authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao/${editando.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao`, { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await mensagemDeErro(res));
      toast.success("Fluxo salvo");
      setEditando(null);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  // ── Manipulação do rascunho ──
  const patchEtapa = (idx: number, patch: Partial<EtapaFluxo>) => {
    if (!editando) return;
    const etapas = [...editando.etapas];
    etapas[idx] = { ...etapas[idx], ...patch };
    setEditando({ ...editando, etapas });
  };
  const addEtapa = () =>
    editando && setEditando({ ...editando, etapas: [...editando.etapas, { ordem: editando.etapas.length + 1, nome: "", exige_assinatura: false }] });
  const moverEtapa = (idx: number, dir: -1 | 1) => {
    if (!editando) return;
    const destino = idx + dir;
    if (destino < 0 || destino >= editando.etapas.length) return;
    const etapas = [...editando.etapas];
    [etapas[idx], etapas[destino]] = [etapas[destino], etapas[idx]];
    setEditando({ ...editando, etapas });
  };
  const removerEtapa = (idx: number) => editando && setEditando({ ...editando, etapas: editando.etapas.filter((_, i) => i !== idx) });
  const alternarTipo = (t: string, marcado: boolean) =>
    editando && setEditando({ ...editando, tipos: marcado ? [...editando.tipos, t] : editando.tipos.filter((x) => x !== t) });

  const ligadas = (cobertura?.tipos ?? []).filter((t) => t.etapas.length > 0);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <Link href="/orgao/configuracoes">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Configurações
          </Button>
        </Link>
        <div className="flex-1 min-w-[16rem]">
          <h1 className="text-xl font-bold text-gray-900">Fluxos de aprovação</h1>
          <p className="text-sm text-gray-600">Conferência interna das peças da fase interna antes de elas valerem.</p>
        </div>
        {admin && (
          <Button className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5 shrink-0" onClick={novoFluxo}>
            <Plus className="w-4 h-4" />
            Novo fluxo
          </Button>
        )}
      </div>

      {/* Para que serve */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-[#1351b4]" aria-hidden="true" /> Para que serve
          </p>
          <p className="text-sm text-gray-700">
            É uma <b>conferência interna antes de a peça valer</b> (ex.: o chefe do setor confere o TR). Quando a peça é gerada ou anexada na etapa, ela vai sozinha para a 1ª pessoa do fluxo.
          </p>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
            <li>Aprovou → segue para a próxima pessoa.</li>
            <li>A última aprovou → a peça vale (se a etapa pedir assinatura, quem aprova assina).</li>
            <li>Reprovou → a peça volta para quem a fez, com o motivo.</li>
            <li>
              Quem aprova vê a peça em <Link className="text-blue-800 hover:underline" href="/orgao/aprovacoes?tab=documentos">Aprovações › Documentos</Link> e recebe aviso (sino, e-mail e WhatsApp).
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Onde vale */}
      <div className={`rounded-lg border p-4 space-y-2 ${cobertura && !cobertura.alguma_ligada ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50"}`} role="status">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700" aria-hidden="true" />
          Só vale para as etapas com &quot;aprovação interna&quot; ligada em Configurações › Fluxo da fase interna
        </p>
        {loading || !cobertura ? (
          <p className="text-sm text-gray-600">Carregando…</p>
        ) : !cobertura.alguma_ligada ? (
          <p className="text-sm text-amber-900">
            Hoje <b>nenhuma etapa</b> está com a aprovação interna ligada: os fluxos abaixo ainda não são usados em nenhum processo.
          </p>
        ) : (
          <ul className="text-sm text-gray-800 space-y-1.5">
            {ligadas.map((t) => (
              <li key={t.tipo}>
                <b>{t.rotulo}:</b>{" "}
                {t.etapas.map((e, i) => (
                  <span key={e.codigo}>
                    {i > 0 && "; "}
                    {e.titulo} —{" "}
                    {e.pecas.map((p, j) => (
                      <span key={p.tipo}>
                        {j > 0 && ", "}
                        {p.titulo}{" "}
                        {p.fluxo ? (
                          <span className="text-gray-600">(fluxo &quot;{p.fluxo.nome}&quot;{p.fluxo.generico ? ", genérico" : ""})</span>
                        ) : (
                          <span className="text-amber-800">(sem fluxo cadastrado: aprovação única por quem conduz o processo)</span>
                        )}
                      </span>
                    ))}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 flex-wrap pt-1">
          <Link href={cobertura?.tela_modelo_fluxo ?? "/orgao/configuracoes/fluxo"}>
            <Button size="sm" variant="outline" className="h-8 bg-white">
              Ligar ou desligar a aprovação interna das etapas
            </Button>
          </Link>
        </div>
      </div>

      {/* Fluxos do órgão */}
      <section aria-labelledby="titulo-fluxos" className="space-y-3">
        <h2 id="titulo-fluxos" className="text-base font-semibold text-gray-900">
          Fluxos do órgão
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : fluxos.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-8 text-center">
              <Workflow className="w-9 h-9 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Nenhum fluxo cadastrado. Comece por um modelo pronto abaixo.</p>
            </CardContent>
          </Card>
        ) : (
          fluxos.map((f) => (
            <Card key={f.id} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    <GitBranch className="w-4 h-4 text-[#1351b4]" />
                    {f.nome}
                    {f.generico ? (
                      <Badge className="border-0 text-[10px] bg-amber-100 text-amber-800">Genérico</Badge>
                    ) : (
                      f.tipos_titulos.map((t) => (
                        <Badge key={t.tipo} className="border-0 text-[10px] bg-blue-100 text-[#1351b4]">
                          {t.titulo}
                        </Badge>
                      ))
                    )}
                  </CardTitle>
                  {admin && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => editarFluxo(f)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-red-600 hover:bg-red-50" onClick={() => remover(f)} aria-label={`Remover ${f.nome}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {f.generico && (
                  <p className="text-xs text-amber-800 mt-1">Genérico: vale para todas as peças sem fluxo próprio (nas etapas com aprovação interna ligada).</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  {[...(f.etapas || [])]
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((e, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {i > 0 && <span className="text-gray-400 text-xs">→</span>}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-700">
                          <span className="w-4 h-4 rounded-full bg-[#1351b4] text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                          {e.nome}
                          <span className="text-gray-500">· {e.usuario_nome || (e.setor_nome ? `setor ${e.setor_nome}` : "quem conduz o processo")}</span>
                          {e.exige_assinatura && <PenLine className="w-3 h-3 text-purple-600" aria-label="exige assinatura" />}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Modelos prontos */}
      <section aria-labelledby="titulo-modelos" className="space-y-3">
        <h2 id="titulo-modelos" className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#1351b4]" aria-hidden="true" /> Modelos prontos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {modelos.map((m) => {
            const jaTem = fluxos.some((f) => f.modelo_origem === m.codigo);
            return (
              <Card key={m.id} className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{m.nome}</p>
                    {jaTem && (
                      <Badge className="border-0 text-[10px] bg-green-100 text-green-800 gap-1">
                        <CheckCircle2 className="w-3 h-3" /> em uso
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-600">{m.descricao}</p>
                  <div className="flex gap-1 flex-wrap">
                    {m.tipos_titulos.map((t) => (
                      <Badge key={t.tipo} variant="outline" className="text-[10px]">
                        {t.titulo}
                      </Badge>
                    ))}
                  </div>
                  <ol className="text-xs text-gray-700 space-y-0.5">
                    {m.etapas.map((e) => (
                      <li key={e.ordem}>
                        {e.ordem}. {e.nome} <span className="text-gray-500">({e.sugestao_responsavel})</span>
                        {e.exige_assinatura && <PenLine className="inline w-3 h-3 ml-1 text-purple-600" aria-label="exige assinatura" />}
                      </li>
                    ))}
                  </ol>
                  {admin && (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => usarModelo(m)}>
                      Usar este modelo
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!loading && !modelos.length && <p className="text-sm text-gray-600">Nenhum modelo pronto disponível.</p>}
        </div>
      </section>

      {/* Editor */}
      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar fluxo" : editando?.modelo_origem ? "Novo fluxo (a partir do modelo)" : "Novo fluxo de aprovação"}</DialogTitle>
            <DialogDescription>
              As etapas seguem a ordem: aprovou, vai para a próxima; reprovou, volta para quem fez a peça, com o motivo.
            </DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="nome-fluxo">Nome do fluxo</Label>
                <Input id="nome-fluxo" className="mt-1" placeholder="Ex.: TR conferido pelo chefe" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
              </div>

              <fieldset>
                <legend className="text-sm font-medium text-gray-900">Vale para as peças</legend>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {pecas.map((p) => (
                    <label key={p.tipo} className="flex items-center gap-2 text-sm text-gray-800">
                      <input type="checkbox" className="h-4 w-4" checked={editando.tipos.includes(p.tipo)} onChange={(e) => alternarTipo(p.tipo, e.target.checked)} />
                      {p.titulo}
                    </label>
                  ))}
                </div>
                {editando.tipos.length === 0 && (
                  <p className="mt-2 text-xs rounded border border-amber-300 bg-amber-50 text-amber-900 px-2 py-1.5">
                    Nenhuma peça marcada = fluxo <b>Genérico</b>: vale para todas as peças sem fluxo próprio.
                  </p>
                )}
              </fieldset>

              <div>
                <Label className="mb-2 block">Etapas</Label>
                <div className="space-y-2">
                  {editando.etapas.map((etapa, idx) => {
                    const faltaEscolha = !!editando.modelo_origem && semResponsavel(etapa);
                    const destacar = faltaEscolha && tentouSalvar;
                    return (
                      <div key={idx} className={`p-3 rounded-lg border space-y-2 ${destacar ? "border-red-400 bg-red-50/40" : "border-gray-200 bg-gray-50/50"}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[#1351b4] text-white text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                          <Input
                            className="h-8 text-sm"
                            aria-label={`Nome da etapa ${idx + 1}`}
                            placeholder="Nome da etapa (ex.: Conferência do chefe)"
                            value={etapa.nome}
                            onChange={(e) => patchEtapa(idx, { nome: e.target.value })}
                          />
                          <div className="flex gap-0.5 shrink-0">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={idx === 0} onClick={() => moverEtapa(idx, -1)} aria-label="Subir">
                              <ArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={idx === editando.etapas.length - 1} onClick={() => moverEtapa(idx, 1)} aria-label="Descer">
                              <ArrowDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" onClick={() => removerEtapa(idx)} aria-label="Remover etapa">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        {etapa.sugestao_responsavel && (
                          <p className="text-xs text-gray-600">
                            Sugestão do modelo: <b>{etapa.sugestao_responsavel}</b>
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Select
                            value={etapa.setor_id ?? NENHUM}
                            onValueChange={(v) => patchEtapa(idx, { setor_id: v === NENHUM ? null : v, setor_nome: setores.find((s) => s.id === v)?.nome ?? null })}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label="Setor">
                              <SelectValue placeholder="Escolha o setor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NENHUM}>{editando.modelo_origem ? "Escolha o setor…" : "Sem setor"}</SelectItem>
                              {setores.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.codigo ? `${s.codigo} — ` : ""}
                                  {s.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={etapa.usuario_id ?? NENHUM}
                            onValueChange={(v) => {
                              const u = usuarios.find((x) => x.id === v);
                              patchEtapa(idx, { usuario_id: v === NENHUM ? null : v, usuario_nome: u?.nome || u?.email || null });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label="Pessoa">
                              <SelectValue placeholder="Escolha a pessoa" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NENHUM}>{etapa.setor_id ? "Qualquer pessoa do setor" : editando.modelo_origem ? "…ou escolha a pessoa" : "Sem pessoa"}</SelectItem>
                              {usuarios.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.nome || u.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {faltaEscolha ? (
                          <p className={`text-xs ${destacar ? "text-red-700 font-medium" : "text-amber-800"}`} role={destacar ? "alert" : undefined}>
                            Escolha o setor ou a pessoa desta etapa antes de salvar.
                          </p>
                        ) : semResponsavel(etapa) ? (
                          <p className="text-xs text-gray-600">Sem setor e sem pessoa: aprova quem conduz o processo (agente ou administrador).</p>
                        ) : etapa.usuario_id ? (
                          <p className="text-xs text-gray-600">Só esta pessoa aprova.</p>
                        ) : (
                          <p className="text-xs text-gray-600">Qualquer pessoa do setor aprova.</p>
                        )}
                        <label className="flex items-center gap-2 text-xs text-gray-700">
                          <Switch checked={etapa.exige_assinatura} onCheckedChange={(v) => patchEtapa(idx, { exige_assinatura: v })} />
                          <PenLine className="w-3.5 h-3.5 text-purple-600" />
                          Ao aprovar, quem aprova assina a peça
                          {etapa.exige_assinatura && idx !== editando.etapas.length - 1 && <span className="text-red-700">(só na última etapa)</span>}
                        </label>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={addEtapa}>
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar etapa
                  </Button>
                </div>
              </div>
              {tentouSalvar && problemas.length > 0 && (
                <ul className="text-xs text-red-700 list-disc pl-5" role="alert">
                  {problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {editando.tipos.length > 0 && (
                <p className="text-xs text-gray-600">Peças: {editando.tipos.map(tituloPeca).join(", ")}.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5" disabled={salvando} onClick={salvar}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
