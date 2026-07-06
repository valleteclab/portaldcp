"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  GitBranch,
  Loader2,
  PenLine,
  Plus,
  Save,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_URL, authFetch } from "@/lib/api";
import { TITULOS_TIPO } from "@/lib/fase-interna/secoes-template";

// Tipos de documento que costumam ter fluxo próprio de aprovação
const TIPOS_DOCUMENTO = [
  "DFD",
  "ETP",
  "AR",
  "TR",
  "PB",
  "PP",
  "PJ",
  "PT",
  "AA",
  "DP",
  "ME",
  "JC",
  "DO",
] as const;

interface Setor {
  id: string;
  codigo: string;
  nome: string;
}

interface Usuario {
  id: string;
  nome?: string;
  email?: string;
}

interface EtapaFluxo {
  ordem: number;
  nome: string;
  descricao?: string;
  setor_id?: string;
  setor_nome?: string;
  usuario_id?: string;
  usuario_nome?: string;
  exige_assinatura: boolean;
}

interface FluxoAprovacao {
  id: string;
  orgao_id: string;
  tipo_documento: string | null;
  nome: string;
  etapas: EtapaFluxo[];
  ativo: boolean;
}

const SEM_SETOR = "__nenhum__";
const SEM_USUARIO = "__nenhum__";

function getOrgaoId(): string | undefined {
  try {
    return JSON.parse(localStorage.getItem("orgao") || "{}")?.id;
  } catch {
    return undefined;
  }
}

function labelTipo(tipo: string | null): string {
  if (!tipo) return "Genérico (todos os documentos)";
  return `${TITULOS_TIPO[tipo] || tipo} (${tipo})`;
}

/** Rascunho editável de um fluxo (novo ou existente) */
type Rascunho = {
  id?: string;
  tipo_documento: string | null;
  nome: string;
  etapas: EtapaFluxo[];
};

export default function FluxosAprovacaoPage() {
  const [fluxos, setFluxos] = useState<FluxoAprovacao[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<Rascunho | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const orgaoId = getOrgaoId();
    if (!orgaoId) {
      setLoading(false);
      toast.error("Órgão não identificado");
      return;
    }
    try {
      const [resFluxos, resSetores, resUsuarios] = await Promise.all([
        authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao?orgaoId=${orgaoId}`),
        authFetch(`${API_URL}/api/orgaos/${orgaoId}/setores`),
        authFetch(`${API_URL}/api/usuarios?orgao_id=${orgaoId}`),
      ]);
      if (resFluxos.ok) {
        const data = await resFluxos.json();
        setFluxos((Array.isArray(data) ? data : []).filter((f: FluxoAprovacao) => f.ativo));
      }
      if (resSetores.ok) {
        const data = await resSetores.json();
        setSetores(Array.isArray(data) ? data : data?.setores || []);
      }
      if (resUsuarios.ok) {
        const data = await resUsuarios.json();
        setUsuarios(Array.isArray(data) ? data : data?.usuarios || data?.data || []);
      }
    } catch {
      toast.error("Erro ao carregar fluxos de aprovação");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const novoFluxo = () => {
    setEditando({
      tipo_documento: null,
      nome: "",
      etapas: [{ ordem: 1, nome: "Aprovação", exige_assinatura: false }],
    });
  };

  const editarFluxo = (f: FluxoAprovacao) => {
    setEditando({
      id: f.id,
      tipo_documento: f.tipo_documento,
      nome: f.nome,
      etapas: [...(f.etapas || [])].sort((a, b) => a.ordem - b.ordem),
    });
  };

  const remover = async (f: FluxoAprovacao) => {
    if (!confirm(`Remover o fluxo "${f.nome}"?`)) return;
    const res = await authFetch(
      `${API_URL}/api/fase-interna/fluxos-aprovacao/${f.id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      toast.success("Fluxo removido");
      carregar();
    } else {
      toast.error("Erro ao remover fluxo");
    }
  };

  const salvar = async () => {
    if (!editando) return;
    if (!editando.nome.trim()) {
      toast.error("Dê um nome ao fluxo");
      return;
    }
    if (!editando.etapas.length) {
      toast.error("O fluxo precisa de pelo menos uma etapa");
      return;
    }
    if (editando.etapas.some((e) => !e.nome.trim())) {
      toast.error("Toda etapa precisa de um nome");
      return;
    }
    const orgaoId = getOrgaoId();
    let usuario: { id?: string; nome?: string } = {};
    try {
      usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
    } catch {
      /* ignore */
    }
    // Reordena etapas 1..N antes de enviar
    const etapas = editando.etapas.map((e, i) => ({ ...e, ordem: i + 1 }));
    const payload = {
      orgao_id: orgaoId,
      tipo_documento: editando.tipo_documento,
      nome: editando.nome.trim(),
      etapas,
      criado_por_id: usuario.id,
      criado_por_nome: usuario.nome,
    };
    setSalvando(true);
    try {
      const res = editando.id
        ? await authFetch(
            `${API_URL}/api/fase-interna/fluxos-aprovacao/${editando.id}`,
            { method: "PUT", body: JSON.stringify(payload) },
          )
        : await authFetch(`${API_URL}/api/fase-interna/fluxos-aprovacao`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Erro ao salvar");
      }
      toast.success("Fluxo salvo");
      setEditando(null);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  // ── Manipulação de etapas no rascunho ──
  const patchEtapa = (idx: number, patch: Partial<EtapaFluxo>) => {
    if (!editando) return;
    const etapas = [...editando.etapas];
    etapas[idx] = { ...etapas[idx], ...patch };
    setEditando({ ...editando, etapas });
  };

  const addEtapa = () => {
    if (!editando) return;
    setEditando({
      ...editando,
      etapas: [
        ...editando.etapas,
        {
          ordem: editando.etapas.length + 1,
          nome: "",
          exige_assinatura: false,
        },
      ],
    });
  };

  const moverEtapa = (idx: number, dir: -1 | 1) => {
    if (!editando) return;
    const destino = idx + dir;
    if (destino < 0 || destino >= editando.etapas.length) return;
    const etapas = [...editando.etapas];
    [etapas[idx], etapas[destino]] = [etapas[destino], etapas[idx]];
    setEditando({ ...editando, etapas });
  };

  const removerEtapa = (idx: number) => {
    if (!editando) return;
    setEditando({
      ...editando,
      etapas: editando.etapas.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/orgao/configuracoes">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Configurações
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            Fluxos de aprovação
          </h1>
          <p className="text-sm text-gray-500">
            Defina as etapas de aprovação dos documentos da fase interna
            (ex.: Revisão técnica → Jurídico → Autoridade). Um fluxo por tipo de
            documento; o fluxo <strong>Genérico</strong> vale para tipos sem
            fluxo próprio. Sem fluxo configurado, o documento tem aprovação
            única.
          </p>
        </div>
        <Button
          className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5 shrink-0"
          onClick={novoFluxo}
        >
          <Plus className="w-4 h-4" />
          Novo fluxo
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : fluxos.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <Workflow className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Nenhum fluxo configurado. Os documentos usam aprovação única até
              você criar um fluxo.
            </p>
            <Button
              variant="outline"
              className="mt-4 gap-1.5"
              onClick={novoFluxo}
            >
              <Plus className="w-4 h-4" />
              Criar primeiro fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {fluxos.map((f) => (
            <Card key={f.id} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-[#1351b4]" />
                    {f.nome}
                    <Badge
                      className={`border-0 text-[10px] ${
                        f.tipo_documento
                          ? "bg-blue-100 text-[#1351b4]"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {labelTipo(f.tipo_documento)}
                    </Badge>
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => editarFluxo(f)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => remover(f)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  {[...(f.etapas || [])]
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((e, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {i > 0 && (
                          <span className="text-gray-300 text-xs">→</span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-700">
                          <span className="w-4 h-4 rounded-full bg-[#1351b4] text-white text-[9px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          {e.nome}
                          {e.setor_nome && (
                            <span className="text-gray-400">· {e.setor_nome}</span>
                          )}
                          {e.exige_assinatura && (
                            <PenLine className="w-3 h-3 text-purple-500" />
                          )}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de edição */}
      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editando?.id ? "Editar fluxo" : "Novo fluxo de aprovação"}
            </DialogTitle>
            <DialogDescription>
              As etapas são executadas em ordem. A aprovação de uma libera a
              seguinte; a reprovação devolve o documento para elaboração.
            </DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome do fluxo</Label>
                  <Input
                    className="mt-1"
                    placeholder="Ex.: Fluxo padrão do TR"
                    value={editando.nome}
                    onChange={(e) =>
                      setEditando({ ...editando, nome: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Tipo de documento</Label>
                  <Select
                    value={editando.tipo_documento ?? "__generico__"}
                    onValueChange={(v) =>
                      setEditando({
                        ...editando,
                        tipo_documento: v === "__generico__" ? null : v,
                      })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__generico__">
                        Genérico (todos)
                      </SelectItem>
                      {TIPOS_DOCUMENTO.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TITULOS_TIPO[t] || t} ({t})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Etapas</Label>
                <div className="space-y-2">
                  {editando.etapas.map((etapa, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#1351b4] text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <Input
                          className="h-8 text-sm"
                          placeholder="Nome da etapa (ex.: Aprovação do Jurídico)"
                          value={etapa.nome}
                          onChange={(e) =>
                            patchEtapa(idx, { nome: e.target.value })
                          }
                        />
                        <div className="flex gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={idx === 0}
                            onClick={() => moverEtapa(idx, -1)}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={idx === editando.etapas.length - 1}
                            onClick={() => moverEtapa(idx, 1)}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                            onClick={() => removerEtapa(idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={etapa.setor_id ?? SEM_SETOR}
                          onValueChange={(v) => {
                            const setor = setores.find((s) => s.id === v);
                            patchEtapa(idx, {
                              setor_id: v === SEM_SETOR ? undefined : v,
                              setor_nome: setor?.nome,
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Setor responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_SETOR}>
                              Qualquer setor
                            </SelectItem>
                            {setores.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.codigo ? `${s.codigo} — ` : ""}
                                {s.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={etapa.usuario_id ?? SEM_USUARIO}
                          onValueChange={(v) => {
                            const u = usuarios.find((x) => x.id === v);
                            patchEtapa(idx, {
                              usuario_id: v === SEM_USUARIO ? undefined : v,
                              usuario_nome: u?.nome || u?.email,
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Usuário (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_USUARIO}>
                              Qualquer usuário do setor
                            </SelectItem>
                            {usuarios.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.nome || u.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <Switch
                          checked={etapa.exige_assinatura}
                          onCheckedChange={(v) =>
                            patchEtapa(idx, { exige_assinatura: v })
                          }
                        />
                        <PenLine className="w-3.5 h-3.5 text-purple-500" />
                        Ao aprovar, exige assinatura do documento
                      </label>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={addEtapa}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar etapa
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5"
              disabled={salvando}
              onClick={salvar}
            >
              {salvando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
