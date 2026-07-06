"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  RotateCcw,
  Save,
  Scale,
  Timer,
  Plus,
  Trash2,
  Gavel,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL, authFetch, formatarDataBR } from "@/lib/api";

interface Parametros {
  tempo_inatividade_minutos: number;
  tempo_prorrogacao_minutos: number;
  intervalo_minimo_lances_minutos: number;
  tempo_aleatorio_min_minutos: number;
  tempo_aleatorio_max_minutos: number;
  lance_final_fechado_minutos: number;
  etapa_aberta_hibrida_minutos: number;
  cancelamento_direto_segundos: number;
  prazo_intencao_recurso_minutos: number;
  prazo_recursal_dias_uteis: number;
  prazo_contrarrazoes_dias_uteis: number;
  percentual_empate_ficto_pregao: number;
  percentual_empate_ficto_demais: number;
  percentual_cota_maxima_mpe: number;
  validade_proposta_dias: number;
}

interface LimiteLegal {
  id?: string;
  chave: string;
  descricao?: string;
  valor: number;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  fonte?: string;
}

const CAMPOS_TEMPO: { key: keyof Parametros; label: string; sufixo: string; fundamento: string }[] = [
  { key: "tempo_inatividade_minutos", label: "Tempo de inatividade (encerramento)", sufixo: "min", fundamento: "Art. 56, §4º" },
  { key: "tempo_prorrogacao_minutos", label: "Prorrogação automática a cada lance", sufixo: "min", fundamento: "Art. 56, §4º" },
  { key: "intervalo_minimo_lances_minutos", label: "Intervalo mínimo entre lances", sufixo: "min", fundamento: "Art. 56, §3º" },
  { key: "tempo_aleatorio_min_minutos", label: "Tempo aleatório mínimo", sufixo: "min", fundamento: "IN 73/2022" },
  { key: "tempo_aleatorio_max_minutos", label: "Tempo aleatório máximo", sufixo: "min", fundamento: "IN 73/2022" },
  { key: "lance_final_fechado_minutos", label: "Lance final fechado (modo aberto-fechado)", sufixo: "min", fundamento: "IN 73/2022, art. 24" },
  { key: "etapa_aberta_hibrida_minutos", label: "Etapa aberta (modos híbridos)", sufixo: "min", fundamento: "IN 73/2022, arts. 24-25" },
  { key: "cancelamento_direto_segundos", label: "Cancelamento direto de lance (fornecedor)", sufixo: "seg", fundamento: "—" },
];

const CAMPOS_RECURSO: { key: keyof Parametros; label: string; sufixo: string; fundamento: string }[] = [
  { key: "prazo_intencao_recurso_minutos", label: "Prazo de intenção de recurso", sufixo: "min", fundamento: "Art. 165" },
  { key: "prazo_recursal_dias_uteis", label: "Prazo recursal", sufixo: "dias úteis", fundamento: "Art. 165" },
  { key: "prazo_contrarrazoes_dias_uteis", label: "Prazo de contrarrazões", sufixo: "dias úteis", fundamento: "Art. 165" },
];

const CAMPOS_MPE: { key: keyof Parametros; label: string; sufixo: string; fundamento: string }[] = [
  { key: "percentual_empate_ficto_pregao", label: "Empate ficto no pregão", sufixo: "%", fundamento: "LC 123, art. 44, §1º" },
  { key: "percentual_empate_ficto_demais", label: "Empate ficto nas demais modalidades", sufixo: "%", fundamento: "LC 123, art. 44, §2º" },
  { key: "percentual_cota_maxima_mpe", label: "Cota reservada máxima ME/EPP", sufixo: "%", fundamento: "LC 123, art. 48, III" },
  { key: "validade_proposta_dias", label: "Validade padrão da proposta", sufixo: "dias", fundamento: "Art. 90" },
];

function getOrgaoId(): string | undefined {
  try {
    return JSON.parse(localStorage.getItem("orgao") || "{}")?.id;
  } catch {
    return undefined;
  }
}

function fmtMoeda(v: number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ParametrosLicitacaoPage() {
  const [params, setParams] = useState<Parametros | null>(null);
  const [limites, setLimites] = useState<LimiteLegal[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editandoLimite, setEditandoLimite] = useState<LimiteLegal | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const orgaoId = getOrgaoId();
    try {
      const [resParams, resLimites] = await Promise.all([
        authFetch(`${API_URL}/api/parametros-licitacao${orgaoId ? `?orgaoId=${orgaoId}` : ""}`),
        authFetch(`${API_URL}/api/parametros-licitacao/limites/lista${orgaoId ? `?orgaoId=${orgaoId}` : ""}`),
      ]);
      if (resParams.ok) setParams(await resParams.json());
      if (resLimites.ok) setLimites(await resLimites.json());
    } catch {
      toast.error("Erro ao carregar parâmetros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const setCampo = (key: keyof Parametros, valor: string) => {
    if (!params) return;
    setParams({ ...params, [key]: valor === "" ? 0 : Number(valor) });
  };

  const salvar = async () => {
    const orgaoId = getOrgaoId();
    if (!orgaoId || !params) {
      toast.error("Órgão não identificado");
      return;
    }
    setSalvando(true);
    try {
      const res = await authFetch(`${API_URL}/api/parametros-licitacao/${orgaoId}`, {
        method: "PUT",
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error();
      toast.success("Parâmetros salvos");
      carregar();
    } catch {
      toast.error("Erro ao salvar parâmetros");
    } finally {
      setSalvando(false);
    }
  };

  const restaurarPadrao = async () => {
    const orgaoId = getOrgaoId();
    if (!orgaoId) return;
    if (!confirm("Restaurar os parâmetros para o padrão do sistema? Suas personalizações serão perdidas.")) return;
    const res = await authFetch(`${API_URL}/api/parametros-licitacao/${orgaoId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Parâmetros restaurados para o padrão");
      setParams(await res.json());
    }
  };

  const salvarLimite = async () => {
    if (!editandoLimite) return;
    if (!editandoLimite.chave.trim() || !editandoLimite.vigencia_inicio) {
      toast.error("Chave e vigência inicial são obrigatórias");
      return;
    }
    const orgaoId = getOrgaoId();
    const res = await authFetch(`${API_URL}/api/parametros-licitacao/limites`, {
      method: "POST",
      body: JSON.stringify({ ...editandoLimite, orgao_id: orgaoId }),
    });
    if (res.ok) {
      toast.success("Limite salvo");
      setEditandoLimite(null);
      carregar();
    } else {
      toast.error("Erro ao salvar limite");
    }
  };

  const removerLimite = async (id?: string) => {
    if (!id || !confirm("Remover este limite?")) return;
    const res = await authFetch(`${API_URL}/api/parametros-licitacao/limites/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Limite removido");
      carregar();
    }
  };

  const renderCampos = (
    campos: { key: keyof Parametros; label: string; sufixo: string; fundamento: string }[],
  ) => (
    <div className="grid grid-cols-2 gap-4">
      {campos.map((c) => (
        <div key={c.key}>
          <Label className="text-sm">{c.label}</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              step="0.01"
              value={params ? params[c.key] : ""}
              onChange={(e) => setCampo(c.key, e.target.value)}
              className="w-28"
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">{c.sufixo}</span>
            <span className="text-[10px] text-gray-300 ml-auto">{c.fundamento}</span>
          </div>
        </div>
      ))}
    </div>
  );

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
          <h1 className="text-xl font-bold text-gray-900">Parâmetros de licitação</h1>
          <p className="text-sm text-gray-500">
            Prazos, percentuais e limites usados nas disputas e no julgamento.
            Estes valores substituem os antigos parâmetros fixos no código — cada
            órgão pode ajustar dentro dos limites da Lei 14.133/2021.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={restaurarPadrao}>
            <RotateCcw className="w-4 h-4" />
            Restaurar padrão
          </Button>
          <Button
            size="sm"
            className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5"
            disabled={salvando}
            onClick={salvar}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Timer className="w-4 h-4 text-[#1351b4]" />
                Tempos da disputa
              </CardTitle>
            </CardHeader>
            <CardContent>{renderCampos(CAMPOS_TEMPO)}</CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Gavel className="w-4 h-4 text-[#1351b4]" />
                Recursos
              </CardTitle>
            </CardHeader>
            <CardContent>{renderCampos(CAMPOS_RECURSO)}</CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#1351b4]" />
                ME/EPP e proposta
              </CardTitle>
            </CardHeader>
            <CardContent>{renderCampos(CAMPOS_MPE)}</CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#1351b4]" />
                    Limites legais (dispensa por valor)
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Valores do art. 75 (I e II) atualizados por decreto. Edite aqui
                    quando um novo decreto reajustar — sem precisar de deploy.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    setEditandoLimite({
                      chave: "",
                      valor: 0,
                      vigencia_inicio: new Date().toISOString().slice(0, 10),
                    })
                  }
                >
                  <Plus className="w-4 h-4" />
                  Novo limite
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chave</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vigência</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {limites.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs font-medium">
                        {l.chave}
                        {l.descricao && (
                          <p className="text-[10px] text-gray-400 font-normal">{l.descricao}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{fmtMoeda(l.valor)}</TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {formatarDataBR(l.vigencia_inicio)}
                        {l.vigencia_fim ? ` a ${formatarDataBR(l.vigencia_fim)}` : ""}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{l.fonte || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditandoLimite(l)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600"
                            onClick={() => removerLimite(l.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {limites.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-gray-400 py-6">
                        Nenhum limite cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog de limite */}
      <Dialog open={!!editandoLimite} onOpenChange={(v) => !v && setEditandoLimite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoLimite?.id ? "Editar limite" : "Novo limite legal"}</DialogTitle>
          </DialogHeader>
          {editandoLimite && (
            <div className="space-y-3">
              <div>
                <Label>Chave</Label>
                <Input
                  className="mt-1"
                  placeholder="Ex.: DISPENSA_COMPRAS_SERVICOS"
                  value={editandoLimite.chave}
                  onChange={(e) =>
                    setEditandoLimite({ ...editandoLimite, chave: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  className="mt-1"
                  value={editandoLimite.descricao || ""}
                  onChange={(e) =>
                    setEditandoLimite({ ...editandoLimite, descricao: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="mt-1"
                    value={editandoLimite.valor}
                    onChange={(e) =>
                      setEditandoLimite({ ...editandoLimite, valor: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Fonte</Label>
                  <Input
                    className="mt-1"
                    placeholder="Ex.: Decreto 12.343/2024"
                    value={editandoLimite.fonte || ""}
                    onChange={(e) =>
                      setEditandoLimite({ ...editandoLimite, fonte: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Vigência inicial</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={editandoLimite.vigencia_inicio}
                    onChange={(e) =>
                      setEditandoLimite({ ...editandoLimite, vigencia_inicio: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Vigência final (opcional)</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={editandoLimite.vigencia_fim || ""}
                    onChange={(e) =>
                      setEditandoLimite({
                        ...editandoLimite,
                        vigencia_fim: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoLimite(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-[#1351b4] hover:bg-[#0c326f] text-white"
              onClick={salvarLimite}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
