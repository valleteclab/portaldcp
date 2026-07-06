"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Lock,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL, authFetch } from "@/lib/api";
import { TITULOS_TIPO } from "@/lib/fase-interna/secoes-template";

interface SecaoModelo {
  id: string;
  titulo: string;
  placeholder?: string;
  texto_padrao?: string;
  obrigatorio: boolean;
  fundamento_legal?: string;
  rows?: number;
}

interface ModeloDocumento {
  id: string;
  orgao_id: string | null;
  tipo: string;
  nome: string;
  descricao?: string;
  fundamento_legal?: string;
  intro?: string;
  cabecalho_html?: string;
  rodape_html?: string;
  secoes: SecaoModelo[];
  padrao_sistema: boolean;
  ativo: boolean;
  versao: number;
}

const VARIAVEIS_DISPONIVEIS = [
  "{{orgao.nome}}",
  "{{orgao.cnpj}}",
  "{{orgao.cidade}}",
  "{{licitacao.numero_processo}}",
  "{{licitacao.numero_edital}}",
  "{{licitacao.objeto}}",
  "{{licitacao.modalidade}}",
  "{{licitacao.valor_estimado}}",
  "{{data_atual}}",
];

function getOrgaoId(): string | undefined {
  try {
    return JSON.parse(localStorage.getItem("orgao") || "{}")?.id;
  } catch {
    return undefined;
  }
}

export default function ModelosDocumentoPage() {
  const [modelos, setModelos] = useState<ModeloDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<ModeloDocumento | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const orgaoId = getOrgaoId();
      const res = await authFetch(
        `${API_URL}/api/fase-interna/modelos${orgaoId ? `?orgaoId=${orgaoId}` : ""}`,
      );
      if (res.ok) setModelos(await res.json());
    } catch {
      toast.error("Erro ao carregar modelos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const duplicar = async (modelo: ModeloDocumento) => {
    const orgaoId = getOrgaoId();
    if (!orgaoId) {
      toast.error("Órgão não identificado");
      return;
    }
    let usuario: { id?: string; nome?: string } = {};
    try {
      usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
    } catch {
      /* ignore */
    }
    const res = await authFetch(
      `${API_URL}/api/fase-interna/modelos/${modelo.id}/duplicar`,
      {
        method: "POST",
        body: JSON.stringify({
          orgaoId,
          usuarioId: usuario.id,
          usuarioNome: usuario.nome,
        }),
      },
    );
    if (res.ok) {
      toast.success("Modelo duplicado — personalize à vontade");
      const novo = await res.json();
      await carregar();
      setEditando(novo);
    } else {
      toast.error("Erro ao duplicar modelo");
    }
  };

  const desativar = async (modelo: ModeloDocumento) => {
    if (!confirm(`Remover o modelo "${modelo.nome}"?`)) return;
    const res = await authFetch(`${API_URL}/api/fase-interna/modelos/${modelo.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Modelo removido");
      carregar();
    } else {
      toast.error("Erro ao remover modelo");
    }
  };

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      const res = await authFetch(
        `${API_URL}/api/fase-interna/modelos/${editando.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            nome: editando.nome,
            descricao: editando.descricao,
            intro: editando.intro,
            fundamento_legal: editando.fundamento_legal,
            cabecalho_html: editando.cabecalho_html,
            rodape_html: editando.rodape_html,
            secoes: editando.secoes,
            ativo: editando.ativo,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Erro ao salvar");
      }
      toast.success("Modelo salvo");
      setEditando(null);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const atualizarSecao = (idx: number, patch: Partial<SecaoModelo>) => {
    if (!editando) return;
    const secoes = [...editando.secoes];
    secoes[idx] = { ...secoes[idx], ...patch };
    setEditando({ ...editando, secoes });
  };

  // Agrupa por tipo, priorizando modelo do órgão sobre o padrão
  const porTipo = new Map<string, ModeloDocumento[]>();
  for (const m of modelos) {
    if (!m.ativo && !m.padrao_sistema) continue;
    const lista = porTipo.get(m.tipo) || [];
    lista.push(m);
    porTipo.set(m.tipo, lista);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/orgao/configuracoes">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Configurações
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Modelos de documento
          </h1>
          <p className="text-sm text-gray-500">
            Personalize os modelos da fase interna (DFD, ETP, TR, Edital…) com o
            texto padrão do seu órgão. Variáveis como{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">
              {"{{licitacao.objeto}}"}
            </code>{" "}
            são preenchidas automaticamente ao criar o documento.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {[...porTipo.entries()].map(([tipo, lista]) => (
            <Card key={tipo} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#1351b4]" />
                  {TITULOS_TIPO[tipo] || tipo}
                  <span className="text-xs font-normal text-gray-400">({tipo})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lista.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {m.nome}
                      </span>
                      {m.padrao_sistema ? (
                        <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px] gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          Padrão do sistema
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-[#1351b4] border-0 text-[10px]">
                          Personalizado · v{m.versao}
                        </Badge>
                      )}
                      {!m.ativo && (
                        <Badge className="bg-red-100 text-red-600 border-0 text-[10px]">
                          Inativo
                        </Badge>
                      )}
                      <span className="text-xs text-gray-400">
                        {m.secoes?.length || 0} seções
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => duplicar(m)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Duplicar
                      </Button>
                      {!m.padrao_sistema && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => setEditando(m)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-red-600 hover:bg-red-50"
                            onClick={() => desativar(m)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          {porTipo.size === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">
              Nenhum modelo encontrado. Os modelos padrão são criados
              automaticamente pelo sistema.
            </p>
          )}
        </div>
      )}

      {/* Dialog de edição */}
      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar modelo</DialogTitle>
            <DialogDescription>
              Variáveis disponíveis:{" "}
              {VARIAVEIS_DISPONIVEIS.map((v) => (
                <code
                  key={v}
                  className="text-[10px] bg-gray-100 px-1 rounded mr-1 cursor-pointer"
                  onClick={() => navigator.clipboard?.writeText(v)}
                  title="Clique para copiar"
                >
                  {v}
                </code>
              ))}
            </DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome do modelo</Label>
                  <Input
                    className="mt-1"
                    value={editando.nome}
                    onChange={(e) =>
                      setEditando({ ...editando, nome: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Fundamento legal</Label>
                  <Input
                    className="mt-1"
                    value={editando.fundamento_legal || ""}
                    onChange={(e) =>
                      setEditando({
                        ...editando,
                        fundamento_legal: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Texto introdutório (exibido no editor)</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={editando.intro || ""}
                  onChange={(e) =>
                    setEditando({ ...editando, intro: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cabeçalho (HTML, aceita variáveis)</Label>
                  <Textarea
                    className="mt-1 font-mono text-xs"
                    rows={4}
                    value={editando.cabecalho_html || ""}
                    onChange={(e) =>
                      setEditando({ ...editando, cabecalho_html: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Rodapé (HTML, aceita variáveis)</Label>
                  <Textarea
                    className="mt-1 font-mono text-xs"
                    rows={4}
                    value={editando.rodape_html || ""}
                    onChange={(e) =>
                      setEditando({ ...editando, rodape_html: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Seções do documento</Label>
                <div className="space-y-3">
                  {editando.secoes.map((s, idx) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-lg border border-gray-200 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                        <Input
                          className="h-8 text-sm font-medium"
                          value={s.titulo}
                          onChange={(e) =>
                            atualizarSecao(idx, { titulo: e.target.value })
                          }
                        />
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                          <Switch
                            checked={s.obrigatorio}
                            onCheckedChange={(v) =>
                              atualizarSecao(idx, { obrigatorio: v })
                            }
                          />
                          Obrigatória
                        </label>
                      </div>
                      <Textarea
                        className="text-xs"
                        rows={3}
                        placeholder="Texto padrão desta seção (pré-preenchido ao criar o documento; aceita variáveis {{...}})"
                        value={s.texto_padrao || ""}
                        onChange={(e) =>
                          atualizarSecao(idx, { texto_padrao: e.target.value })
                        }
                      />
                      <div className="flex gap-2">
                        <Input
                          className="h-7 text-xs"
                          placeholder="Fundamento legal (ex.: Art. 18, I)"
                          value={s.fundamento_legal || ""}
                          onChange={(e) =>
                            atualizarSecao(idx, {
                              fundamento_legal: e.target.value,
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600 shrink-0"
                          onClick={() =>
                            setEditando({
                              ...editando,
                              secoes: editando.secoes.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={() =>
                      setEditando({
                        ...editando,
                        secoes: [
                          ...editando.secoes,
                          {
                            id: `secao_${Date.now()}`,
                            titulo: `${editando.secoes.length + 1}. Nova seção`,
                            obrigatorio: false,
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar seção
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
              Salvar modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
