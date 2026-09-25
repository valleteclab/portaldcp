"use client";

/**
 * CALENDÁRIO DE FERIADOS DO ÓRGÃO (E7).
 * Lei 14.133/2021, art. 183, III: prazos em dias úteis contam só os dias com
 * expediente no órgão. Nacionais/estaduais vêm da plataforma (somente
 * leitura); pontos facultativos só contam se o órgão os adotar. Feriados
 * municipais, estaduais observados e pontos facultativos próprios são
 * cadastrados aqui.
 * Fonte: GET/POST/PUT/DELETE /api/feriados, PUT /api/feriados/:id/adocao
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL, authFetch } from "@/lib/api";
import { fmtDiaISO, lerErro, erroDeExcecao, type ErroBackend } from "@/lib/publicacao";
import { ErroPendencias } from "@/components/licitacao/ErroPendencias";

type Abrangencia = "NACIONAL" | "ESTADUAL" | "MUNICIPAL";

interface Feriado {
  id: string;
  descricao: string;
  data: string | null;
  movel: string | null;
  recorrente: boolean;
  abrangencia: Abrangencia;
  uf: string | null;
  proprio: boolean;
  ponto_facultativo: boolean;
  adotado: boolean;
  conta: boolean;
  datas_no_ano: string[];
  base_legal?: string | null;
}

interface Calendario {
  orgao_id: string;
  uf: string | null;
  ano: number;
  feriados: Feriado[];
  dias_sem_expediente: Array<{ data: string; descricao: string; dia_semana: string }>;
}

const MOVEIS: { valor: string; rotulo: string }[] = [
  { valor: "CARNAVAL_SEGUNDA", rotulo: "Segunda-feira de Carnaval" },
  { valor: "CARNAVAL_TERCA", rotulo: "Terça-feira de Carnaval" },
  { valor: "QUARTA_CINZAS", rotulo: "Quarta-feira de Cinzas" },
  { valor: "SEXTA_SANTA", rotulo: "Sexta-feira Santa" },
  { valor: "PASCOA", rotulo: "Páscoa" },
  { valor: "CORPUS_CHRISTI", rotulo: "Corpus Christi" },
];

const ROTULO_MOVEL: Record<string, string> = Object.fromEntries(MOVEIS.map((m) => [m.valor, m.rotulo]));

const ROTULO_ABRANGENCIA: Record<Abrangencia, string> = {
  NACIONAL: "Nacional",
  ESTADUAL: "Estadual",
  MUNICIPAL: "Municipal",
};

interface Form {
  id?: string;
  descricao: string;
  tipoData: "FIXA" | "MOVEL";
  data: string;
  recorrente: boolean;
  movel: string;
  ponto_facultativo: boolean;
  abrangencia: "MUNICIPAL" | "ESTADUAL";
  base_legal: string;
}

const FORM_VAZIO: Form = {
  descricao: "",
  tipoData: "FIXA",
  data: "",
  recorrente: true,
  movel: "CORPUS_CHRISTI",
  ponto_facultativo: false,
  abrangencia: "MUNICIPAL",
  base_legal: "",
};

const selectCls = "w-full border rounded-md h-9 px-2 text-sm bg-white";

export default function FeriadosPage() {
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [cal, setCal] = useState<Calendario | null>(null);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<ErroBackend | null>(null);

  const [excluindo, setExcluindo] = useState<Feriado | null>(null);
  const [erroExclusao, setErroExclusao] = useState<ErroBackend | null>(null);
  const [adotando, setAdotando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErroCarga(null);
    try {
      const res = await authFetch(`${API_URL}/api/feriados?ano=${ano}`);
      if (!res.ok) throw new Error((await lerErro(res, "Erro ao carregar o calendário")).mensagem);
      setCal(await res.json());
    } catch (e: any) {
      setErroCarga(e.message || "Erro ao carregar o calendário");
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const daPlataforma = (cal?.feriados || []).filter((f) => !f.proprio);
  const doOrgao = (cal?.feriados || []).filter((f) => f.proprio);

  const quando = (f: Feriado) => {
    const datas = f.datas_no_ano.length ? f.datas_no_ano.map(fmtDiaISO).join(", ") : "não ocorre neste ano";
    const regra = f.movel
      ? `móvel — ${ROTULO_MOVEL[f.movel] || f.movel}`
      : f.recorrente
        ? "todo ano"
        : "só nesta data";
    return { datas, regra };
  };

  const abrirNovo = () => {
    setErroForm(null);
    setForm({ ...FORM_VAZIO });
  };

  const abrirEdicao = (f: Feriado) => {
    setErroForm(null);
    setForm({
      id: f.id,
      descricao: f.descricao,
      tipoData: f.movel ? "MOVEL" : "FIXA",
      data: f.data || "",
      recorrente: f.recorrente,
      movel: f.movel || "CORPUS_CHRISTI",
      ponto_facultativo: f.ponto_facultativo,
      abrangencia: f.abrangencia === "ESTADUAL" ? "ESTADUAL" : "MUNICIPAL",
      base_legal: f.base_legal || "",
    });
  };

  const salvar = async () => {
    if (!form) return;
    if (!form.descricao.trim()) {
      setErroForm({ mensagem: "Informe a descrição do feriado.", pendencias: [] });
      return;
    }
    if (form.tipoData === "FIXA" && !form.data) {
      setErroForm({ mensagem: "Informe a data.", pendencias: [] });
      return;
    }
    const corpo = {
      descricao: form.descricao.trim(),
      data: form.tipoData === "FIXA" ? form.data : null,
      movel: form.tipoData === "MOVEL" ? form.movel : null,
      recorrente: form.tipoData === "MOVEL" ? true : form.recorrente,
      ponto_facultativo: form.ponto_facultativo,
      abrangencia: form.abrangencia,
      base_legal: form.base_legal.trim() || undefined,
    };
    setSalvando(true);
    setErroForm(null);
    try {
      const res = await authFetch(`${API_URL}/api/feriados${form.id ? `/${form.id}` : ""}`, {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        setErroForm(await lerErro(res, "Erro ao salvar o feriado"));
        return;
      }
      toast.success(form.id ? "Feriado atualizado" : "Feriado cadastrado");
      setForm(null);
      carregar();
    } catch (e) {
      setErroForm(erroDeExcecao(e));
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!excluindo) return;
    setSalvando(true);
    setErroExclusao(null);
    try {
      const res = await authFetch(`${API_URL}/api/feriados/${excluindo.id}`, { method: "DELETE" });
      if (!res.ok) {
        setErroExclusao(await lerErro(res, "Erro ao excluir o feriado"));
        return;
      }
      toast.success("Feriado excluído");
      setExcluindo(null);
      carregar();
    } catch (e) {
      setErroExclusao(erroDeExcecao(e));
    } finally {
      setSalvando(false);
    }
  };

  const alternarAdocao = async (f: Feriado) => {
    setAdotando(f.id);
    try {
      const res = await authFetch(`${API_URL}/api/feriados/${f.id}/adocao`, {
        method: "PUT",
        body: JSON.stringify({ adotar: !f.adotado }),
      });
      if (!res.ok) {
        toast.error((await lerErro(res, "Erro ao alterar a adoção")).mensagem);
        return;
      }
      toast.success(f.adotado ? `"${f.descricao}" deixou de contar como dia sem expediente` : `"${f.descricao}" adotado pelo órgão`);
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar a adoção");
    } finally {
      setAdotando(null);
    }
  };

  const badgeConta = (f: Feriado) =>
    f.conta ? (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">sem expediente</Badge>
    ) : (
      <Badge variant="outline" className="text-gray-500">conta como dia útil</Badge>
    );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/orgao/configuracoes">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Configurações
          </Button>
        </Link>
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-xl font-bold text-gray-900">Calendário de feriados</h1>
          <p className="text-sm text-gray-500">
            Dias sem expediente no órgão — usados na contagem dos prazos em dias úteis.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAno((a) => a - 1)} title="Ano anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input
            type="number"
            className="w-24 h-8 text-center"
            value={ano}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 2000 && v <= 2100) setAno(v);
            }}
          />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAno((a) => a + 1)} title="Próximo ano">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded p-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          <b>Lei 14.133/2021, art. 183, III</b> — prazos em dias úteis contam só dias com expediente no órgão;
          usados em publicação (art. 55), dispensa (art. 75 §3º), impugnação (art. 164), recursos (art. 165)
          e revogação/anulação (art. 71 §3º). Pontos facultativos só deixam de contar como dia útil quando
          o órgão os <b>adota</b>.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : erroCarga ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 flex items-center justify-between gap-2">
          <span>{erroCarga}</span>
          <Button size="sm" variant="outline" onClick={carregar}>Tentar de novo</Button>
        </div>
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#1351b4]" />
                Nacionais e estaduais{cal?.uf ? ` (${cal.uf})` : ""}
              </CardTitle>
              <CardDescription className="text-xs">
                Mantidos pela plataforma (somente leitura). Pontos facultativos — Carnaval, Corpus Christi,
                Dia do Servidor — valem só se adotados pelo órgão.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {daPlataforma.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum feriado da plataforma para {ano}.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data em {ano}</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Abrangência</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daPlataforma.map((f) => {
                      const q = quando(f);
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="whitespace-nowrap">
                            <div>{q.datas}</div>
                            <div className="text-[11px] text-gray-400">{q.regra}</div>
                          </TableCell>
                          <TableCell>
                            {f.descricao}
                            {f.ponto_facultativo && (
                              <Badge variant="outline" className="ml-2 text-[10px] border-amber-300 text-amber-700">
                                ponto facultativo
                              </Badge>
                            )}
                            {f.base_legal && <div className="text-[11px] text-gray-400">{f.base_legal}</div>}
                          </TableCell>
                          <TableCell>
                            {ROTULO_ABRANGENCIA[f.abrangencia] || f.abrangencia}
                            {f.uf ? ` — ${f.uf}` : ""}
                          </TableCell>
                          <TableCell>{badgeConta(f)}</TableCell>
                          <TableCell className="text-right">
                            {f.ponto_facultativo ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={adotando === f.id}
                                onClick={() => alternarAdocao(f)}
                              >
                                {adotando === f.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                {f.adotado ? "Deixar de adotar" : "Adotar"}
                              </Button>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[#1351b4]" />
                    Do órgão
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Feriados municipais, estaduais observados pelo órgão e pontos facultativos próprios
                    (decretos locais).
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={abrirNovo}>
                  <Plus className="w-4 h-4" />
                  Novo feriado
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {doOrgao.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Nenhum feriado próprio cadastrado. Cadastre os feriados municipais (ex.: aniversário da
                  cidade, padroeiro) para que não contem como dia útil.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data em {ano}</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Abrangência</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doOrgao.map((f) => {
                      const q = quando(f);
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="whitespace-nowrap">
                            <div>{q.datas}</div>
                            <div className="text-[11px] text-gray-400">{q.regra}</div>
                          </TableCell>
                          <TableCell>
                            {f.descricao}
                            {f.ponto_facultativo && (
                              <Badge variant="outline" className="ml-2 text-[10px] border-amber-300 text-amber-700">
                                ponto facultativo
                              </Badge>
                            )}
                            {f.base_legal && <div className="text-[11px] text-gray-400">{f.base_legal}</div>}
                          </TableCell>
                          <TableCell>{ROTULO_ABRANGENCIA[f.abrangencia] || f.abrangencia}</TableCell>
                          <TableCell>{badgeConta(f)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => abrirEdicao(f)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600"
                              title="Excluir"
                              onClick={() => {
                                setErroExclusao(null);
                                setExcluindo(f);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#1351b4]" />
                Dias sem expediente em {ano} (dias de semana)
              </CardTitle>
              <CardDescription className="text-xs">
                É esta lista que a contagem de prazos usa, além de sábados e domingos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(cal?.dias_sem_expediente || []).length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum dia de semana sem expediente em {ano}.</p>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {cal!.dias_sem_expediente.map((d) => (
                    <li key={`${d.data}-${d.descricao}`} className="flex gap-2">
                      <span className="font-mono text-gray-700 whitespace-nowrap">{fmtDiaISO(d.data)}</span>
                      <span className="text-gray-400 whitespace-nowrap">{d.dia_semana}</span>
                      <span className="text-gray-700 truncate" title={d.descricao}>{d.descricao}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Cadastro / edição */}
      <Dialog open={!!form} onOpenChange={(v) => !v && !salvando && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar feriado" : "Novo feriado do órgão"}</DialogTitle>
            <DialogDescription>
              Vale para a contagem dos prazos de todos os processos do órgão a partir de agora.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Descrição</Label>
                <Input
                  className="mt-1"
                  placeholder="ex.: Aniversário do município"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Abrangência</Label>
                  <select
                    className={`${selectCls} mt-1`}
                    value={form.abrangencia}
                    onChange={(e) => setForm({ ...form, abrangencia: e.target.value as Form["abrangencia"] })}
                  >
                    <option value="MUNICIPAL">Municipal</option>
                    <option value="ESTADUAL">Estadual</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm">Data</Label>
                  <select
                    className={`${selectCls} mt-1`}
                    value={form.tipoData}
                    onChange={(e) => setForm({ ...form, tipoData: e.target.value as Form["tipoData"] })}
                  >
                    <option value="FIXA">Data fixa</option>
                    <option value="MOVEL">Data móvel (Páscoa)</option>
                  </select>
                </div>
              </div>
              {form.tipoData === "FIXA" ? (
                <div className="space-y-2">
                  <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.recorrente}
                      onChange={(e) => setForm({ ...form, recorrente: e.target.checked })}
                    />
                    Repete todo ano (mesmo dia e mês)
                  </label>
                </div>
              ) : (
                <select
                  className={selectCls}
                  value={form.movel}
                  onChange={(e) => setForm({ ...form, movel: e.target.value })}
                >
                  {MOVEIS.map((m) => (
                    <option key={m.valor} value={m.valor}>{m.rotulo}</option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ponto_facultativo}
                  onChange={(e) => setForm({ ...form, ponto_facultativo: e.target.checked })}
                />
                Ponto facultativo decretado pelo órgão
              </label>
              <div>
                <Label className="text-sm">Base legal (opcional)</Label>
                <Input
                  className="mt-1"
                  placeholder="ex.: Lei Municipal nº 123/1990"
                  value={form.base_legal}
                  onChange={(e) => setForm({ ...form, base_legal: e.target.value })}
                  maxLength={200}
                />
              </div>
              <ErroPendencias erro={erroForm} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
            <Button
              className="bg-[#1351b4] hover:bg-[#0c326f] text-white"
              onClick={salvar}
              disabled={salvando}
            >
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exclusão */}
      <Dialog open={!!excluindo} onOpenChange={(v) => !v && !salvando && setExcluindo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir feriado</DialogTitle>
            <DialogDescription>
              &quot;{excluindo?.descricao}&quot; voltará a contar como dia útil nos prazos calculados daqui em diante.
            </DialogDescription>
          </DialogHeader>
          <ErroPendencias erro={erroExclusao} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(null)} disabled={salvando}>Cancelar</Button>
            <Button variant="destructive" onClick={excluir} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
