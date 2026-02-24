'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, FileText, Eye, Send, XCircle, Loader2, Building2, Calendar, Clock, CheckCircle2, ArrowLeft, RefreshCw, DollarSign, ClipboardList, TrendingUp } from 'lucide-react';
import { API_URL, authFetch } from '@/lib/api';
import { ModuleGuard } from '@/components/ModuleGuard';

function formatarMoeda(v: number | string | null | undefined): string {
  const n = Number(v);
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarData(d: string | null | undefined): string {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('pt-BR');
}

interface OrdemServico {
  id: string; contrato_id: string; numero_os: string; descricao: string;
  valor_total: number; saldo_os: number; data_abertura: string; data_prazo: string;
  data_entrega?: string; metrica: string; status: string;
  usuario_cadastro_nome?: string; aprovador_nome?: string; data_aprovacao?: string;
  observacao_aprovador?: string; responsavel_tecnico?: string; sla_excedido?: boolean;
  created_at: string; numero_contrato?: string; fornecedor_nome?: string;
  escopo_detalhado?: string; modalidade_execucao?: string;
}
interface Contrato {
  id: string; numero_contrato: string; objeto: string;
  fornecedor_razao_social: string; fornecedor_cnpj?: string;
  modalidade_execucao: string; categoria?: string;
  valor_global: number; valor_inicial?: number; valor_executado_anterior?: number;
  status: string; data_vigencia_inicio: string; data_vigencia_fim: string;
}

const SL: Record<string, string> = {
  RASCUNHO: 'Rascunho', AGUARDANDO_APROVACAO: 'Aguardando Aprovacao',
  AUTORIZADA: 'Autorizada', ABERTA: 'Aberta', EM_EXECUCAO: 'Em Execucao',
  ENTREGUE: 'Entregue', EM_ACEITE: 'Em Aceite', ACEITA: 'Aceita',
  REJEITADA: 'Rejeitada', CANCELADA: 'Cancelada', CONCLUIDA: 'Concluida',
};
const SC: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-800', AGUARDANDO_APROVACAO: 'bg-yellow-100 text-yellow-800',
  AUTORIZADA: 'bg-blue-100 text-blue-800', ABERTA: 'bg-blue-100 text-blue-800',
  EM_EXECUCAO: 'bg-indigo-100 text-indigo-800', ENTREGUE: 'bg-purple-100 text-purple-800',
  EM_ACEITE: 'bg-orange-100 text-orange-800', ACEITA: 'bg-green-100 text-green-800',
  REJEITADA: 'bg-red-100 text-red-800', CANCELADA: 'bg-red-100 text-red-800',
  CONCLUIDA: 'bg-green-100 text-green-800',
};
const MODS = ['ORDEM_SERVICO', 'CONTINUADO', 'LICENCA', 'MEDICAO'];
const ML: Record<string, string> = { ORDEM_SERVICO: 'Ordem de Servico', CONTINUADO: 'Servico Continuado', LICENCA: 'Licenca', MEDICAO: 'Medicao' };

function diasRest(df: string): number | null {
  if (!df) return null;
  const f = new Date(df); if (isNaN(f.getTime())) return null;
  const h = new Date(); h.setHours(0,0,0,0); f.setHours(0,0,0,0);
  return Math.ceil((f.getTime() - h.getTime()) / 86400000);
}

function OrdensServicoPage() {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingC, setLoadingC] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [fSt, setFSt] = useState('todos');
  const [fCt, setFCt] = useState('todos');
  const [showNew, setShowNew] = useState(false);
  const [step, setStep] = useState(0);
  const [cSel, setCSel] = useState<Contrato | null>(null);
  const [buscaC, setBuscaC] = useState('');
  const [nOS, setNOS] = useState({ desc: '', escopo: '', valor: '', resp: '', dAb: new Date().toISOString().split('T')[0], dPr: '' });
  const [sel, setSel] = useState<OrdemServico | null>(null);
  const [showDet, setShowDet] = useState(false);

  const loadOS = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fSt !== 'todos') p.set('status', fSt);
      if (fCt !== 'todos') p.set('contratoId', fCt);
      const r = await authFetch(`${API_URL}/api/contratos/ordens-servico/listar?${p}`);
      const d = await r.json();
      setOrdens(Array.isArray(d) ? d : []);
    } catch { setOrdens([]); } finally { setLoading(false); }
  }, [fSt, fCt]);

  const loadCt = useCallback(async () => {
    setLoadingC(true);
    try {
      const r = await authFetch(`${API_URL}/api/contratos?status=VIGENTE`);
      const d = await r.json(); const l = Array.isArray(d) ? d : d?.data ?? [];
      setContratos(l.filter((c: Contrato) => MODS.includes(c.modalidade_execucao)));
    } catch { setContratos([]); } finally { setLoadingC(false); }
  }, []);

  useEffect(() => { loadOS(); }, [loadOS]);
  useEffect(() => { loadCt(); }, [loadCt]);

  const oFilt = useMemo(() => ordens.filter(o => {
    if (!search) return true; const s = search.toLowerCase();
    return o.numero_os?.toLowerCase().includes(s) || o.descricao?.toLowerCase().includes(s) || o.numero_contrato?.toLowerCase().includes(s) || o.fornecedor_nome?.toLowerCase().includes(s);
  }), [ordens, search]);

  const tots = useMemo(() => ({
    t: ordens.length, p: ordens.filter(o => o.status === 'AGUARDANDO_APROVACAO').length,
    e: ordens.filter(o => ['EM_EXECUCAO','ABERTA','AUTORIZADA'].includes(o.status)).length,
    d: ordens.filter(o => ['CONCLUIDA','ACEITA'].includes(o.status)).length,
  }), [ordens]);

  const cF = useMemo(() => {
    if (!buscaC) return contratos; const b = buscaC.toLowerCase();
    return contratos.filter(c => c.numero_contrato?.toLowerCase().includes(b) || c.objeto?.toLowerCase().includes(b) || c.fornecedor_razao_social?.toLowerCase().includes(b));
  }, [contratos, buscaC]);

  const openNew = () => {
    setCSel(null); setBuscaC('');
    setNOS({ desc: '', escopo: '', valor: '', resp: '', dAb: new Date().toISOString().split('T')[0], dPr: '' });
    setStep(0); setShowNew(true);
    if (contratos.length === 0) loadCt();
  };

  const saveOS = async () => {
    if (!cSel) return;
    if (!nOS.desc.trim()) { alert('Informe a descricao da OS.'); return; }
    if (!nOS.valor || parseFloat(nOS.valor) <= 0) { alert('Informe o valor total da OS.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { descricao: nOS.desc, valor_total: parseFloat(nOS.valor), data_abertura: nOS.dAb || undefined, data_prazo: nOS.dPr || undefined, responsavel_tecnico: nOS.resp || undefined, escopo_detalhado: nOS.escopo || undefined, submeter_aprovacao: true };
      const r = await authFetch(`${API_URL}/api/contratos/${cSel.id}/ordens-servico`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) { setShowNew(false); loadOS(); } else { const e = await r.json().catch(() => null); alert(e?.message || 'Erro ao criar OS.'); }
    } catch { alert('Erro ao criar OS.'); } finally { setSaving(false); }
  };

  const submitOS = async (id: string) => {
    setSaving(true);
    try { const r = await authFetch(`${API_URL}/api/contratos/ordens-servico/${id}/submeter`, { method: 'PATCH' }); if (r.ok) { loadOS(); if (showDet && sel?.id === id) { setShowDet(false); setSel(null); } } } finally { setSaving(false); }
  };

  const cancelOS = async (id: string) => {
    const m = window.prompt('Informe o motivo do cancelamento:');
    if (!m?.trim()) return; setSaving(true);
    try { const r = await authFetch(`${API_URL}/api/contratos/ordens-servico/${id}/cancelar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ observacao: m.trim() }) }); if (r.ok) { setShowDet(false); setSel(null); loadOS(); } } finally { setSaving(false); }
  };

  return (
    <ModuleGuard modulo="ORDENS_SERVICO">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Ordens de Servico</h1><p className="text-sm text-muted-foreground">Gerencie as ordens de servico dos contratos</p></div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => loadOS()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nova OS</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[['Total de OS', tots.t, 'text-foreground', ClipboardList, 'text-muted-foreground'], ['Pendentes Aprovacao', tots.p, 'text-yellow-600', Clock, 'text-yellow-600'], ['Em Execucao', tots.e, 'text-indigo-600', TrendingUp, 'text-indigo-600'], ['Concluidas', tots.d, 'text-green-600', CheckCircle2, 'text-green-600']].map(([label, val, clr, Icon, iclr], i) => {
            const I = Icon as React.ElementType;
            return (<Card key={i}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">{label as string}</CardTitle><I className={`h-4 w-4 ${iclr}`} /></CardHeader><CardContent><span className={`text-2xl font-bold ${clr}`}>{val as number}</span></CardContent></Card>);
          })}
        </div>

        <Card><CardContent className="pt-6"><div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar por numero, descricao, contrato..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
          <Select value={fSt} onValueChange={setFSt}><SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os Status</SelectItem>{Object.entries(SL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={fCt} onValueChange={setFCt}><SelectTrigger className="w-[250px]"><SelectValue placeholder="Contrato" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os Contratos</SelectItem>{contratos.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.numero_contrato} - {c.fornecedor_razao_social}</SelectItem>)}</SelectContent></Select>
        </div></CardContent></Card>

        <Card><CardHeader><CardTitle className="text-lg">Lista de Ordens de Servico</CardTitle></CardHeader><CardContent>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          : oFilt.length === 0 ? <div className="py-12 text-center text-muted-foreground"><FileText className="mx-auto h-12 w-12 mb-3 opacity-30" /><p>Nenhuma ordem de servico encontrada.</p></div>
          : <Table><TableHeader><TableRow><TableHead>No OS</TableHead><TableHead>Contrato</TableHead><TableHead>Descricao</TableHead><TableHead>Valor</TableHead><TableHead>Saldo OS</TableHead><TableHead>Prazo</TableHead><TableHead>Status</TableHead><TableHead className="w-[120px]">Acoes</TableHead></TableRow></TableHeader>
            <TableBody>{oFilt.map(o => (
              <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSel(o); setShowDet(true); }}>
                <TableCell className="font-medium">{o.numero_os}</TableCell>
                <TableCell><div>{o.numero_contrato}</div>{o.fornecedor_nome && <span className="text-xs text-muted-foreground">{o.fornecedor_nome}</span>}</TableCell>
                <TableCell className="max-w-[200px] truncate">{o.descricao || '-'}</TableCell>
                <TableCell>{formatarMoeda(o.valor_total)}</TableCell>
                <TableCell><span className={o.saldo_os >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{formatarMoeda(o.saldo_os)}</span></TableCell>
                <TableCell>{formatarData(o.data_prazo)}</TableCell>
                <TableCell><Badge variant="secondary" className={SC[o.status] ?? 'bg-gray-100 text-gray-800'}>{SL[o.status] ?? o.status}</Badge></TableCell>
                <TableCell><div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => { setSel(o); setShowDet(true); }}><Eye className="h-4 w-4" /></Button>
                  {(o.status === 'RASCUNHO' || o.status === 'REJEITADA') && <Button variant="default" size="sm" onClick={() => submitOS(o.id)} disabled={saving}><Send className="h-4 w-4" /></Button>}
                  {!['CANCELADA','CONCLUIDA','ACEITA'].includes(o.status) && <Button variant="destructive" size="sm" onClick={() => cancelOS(o.id)} disabled={saving}><XCircle className="h-4 w-4" /></Button>}
                </div></TableCell>
              </TableRow>
            ))}</TableBody></Table>}
        </CardContent></Card>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}><DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-3"><FileText className="h-5 w-5" />Nova Ordem de Servico {step === 0 && <Badge variant="outline">1/2 - Selecionar Contrato</Badge>}{step === 1 && <Badge variant="outline">2/2 - Dados da OS</Badge>}</DialogTitle></DialogHeader>
        {step === 0 && <div className="space-y-4 py-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar contrato por numero, objeto ou fornecedor..." value={buscaC} onChange={e => setBuscaC(e.target.value)} className="pl-9" /></div>
          {loadingC ? <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          : cF.length === 0 ? <div className="py-12 text-center text-muted-foreground"><Building2 className="mx-auto h-12 w-12 mb-3 opacity-30" /><p>Nenhum contrato elegivel encontrado.</p><p className="text-xs mt-1">Apenas contratos vigentes com modalidade de servico sao exibidos.</p></div>
          : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-1">
            {cF.map(c => { const d = diasRest(c.data_vigencia_fim); const s = c.valor_global - (c.valor_executado_anterior || 0); const pc = c.valor_global > 0 ? ((c.valor_executado_anterior || 0) / c.valor_global) * 100 : 0; const is = cSel?.id === c.id;
              return (<Card key={c.id} className={`cursor-pointer transition-all hover:shadow-md ${is ? 'ring-2 ring-blue-500 bg-blue-50/50' : 'hover:bg-gray-50'}`} onClick={() => { setCSel(c); setStep(1); }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2"><div className="flex items-center gap-2 flex-wrap"><Badge variant="outline" className="font-mono text-xs">{c.numero_contrato}</Badge><Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{ML[c.modalidade_execucao] || c.modalidade_execucao}</Badge></div>{is && <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />}</div>
                  <p className="text-sm text-gray-700 line-clamp-2 mb-2">{c.objeto || 'Sem objeto definido'}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate font-medium">{c.fornecedor_razao_social}</span></div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-md p-2"><p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor Global</p><p className="text-sm font-bold text-gray-800">{formatarMoeda(c.valor_global)}</p></div>
                    <div className="bg-green-50 rounded-md p-2"><p className="text-[10px] text-green-600 uppercase tracking-wide">Saldo Disponivel</p><p className="text-sm font-bold text-green-700">{formatarMoeda(s > 0 ? s : 0)}</p></div>
                  </div>
                  <div className="mb-3"><div className="flex justify-between text-[10px] text-gray-500 mb-1"><span>Consumido</span><span>{Math.min(pc, 100).toFixed(0)}%</span></div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${pc > 90 ? 'bg-red-500' : pc > 70 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pc, 100)}%` }} /></div></div>
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
                    <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /><span>{formatarData(c.data_vigencia_inicio)} a {formatarData(c.data_vigencia_fim)}</span></div>
                    {d !== null && <Badge variant="outline" className={`text-[10px] ${d <= 30 ? 'border-red-300 text-red-600' : d <= 90 ? 'border-yellow-300 text-yellow-700' : 'border-green-300 text-green-600'}`}><Clock className="h-2.5 w-2.5 mr-0.5" />{d > 0 ? `${d}d restantes` : 'Vencido'}</Badge>}
                  </div>
                </CardContent>
              </Card>); })}
          </div>}
        </div>}
        {step === 1 && cSel && <div className="space-y-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><Badge variant="outline" className="font-mono">{cSel.numero_contrato}</Badge><Badge className="bg-blue-100 text-blue-700 text-xs">{ML[cSel.modalidade_execucao] || cSel.modalidade_execucao}</Badge></div><Button variant="ghost" size="sm" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4 mr-1" />Trocar</Button></div>
            <p className="text-sm text-gray-700 line-clamp-2 mb-2">{cSel.objeto}</p>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-3"><Building2 className="h-3.5 w-3.5" /><span className="font-medium">{cSel.fornecedor_razao_social}</span></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 pt-3 border-t border-blue-200">
              <div className="bg-white/60 rounded-md p-3"><p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor Global</p><p className="text-sm font-bold text-gray-800">{formatarMoeda(cSel.valor_global)}</p></div>
              <div className="bg-green-100/80 rounded-md p-3"><p className="text-[10px] text-green-700 uppercase tracking-wide">Valor Disponivel</p><p className="text-sm font-bold text-green-800">{formatarMoeda(Math.max(0, cSel.valor_global - (cSel.valor_executado_anterior || 0)))}</p></div>
              <div className="bg-white/60 rounded-md p-3"><p className="text-[10px] text-gray-500 uppercase tracking-wide">Vigencia</p><p className="text-sm font-medium text-gray-800">{formatarData(cSel.data_vigencia_inicio)} a {formatarData(cSel.data_vigencia_fim)}</p></div>
              <div className="bg-white/60 rounded-md p-3"><p className="text-[10px] text-gray-500 uppercase tracking-wide">Dias Restantes</p><p className={`text-sm font-bold ${(() => { const dr = diasRest(cSel.data_vigencia_fim); return dr === null ? 'text-gray-600' : dr <= 30 ? 'text-red-600' : dr <= 90 ? 'text-yellow-700' : 'text-green-600'; })()}`}>{(() => { const dr = diasRest(cSel.data_vigencia_fim); return dr !== null ? (dr > 0 ? `${dr}d restantes` : 'Vencido') : '-'; })()}</p></div>
            </div>
          </div>
          <div className="grid gap-4">
            <div><Label>Descricao da OS <span className="text-red-500">*</span></Label><Textarea value={nOS.desc} onChange={e => setNOS(p => ({ ...p, desc: e.target.value }))} placeholder="Descreva o servico a ser executado..." rows={3} /></div>
            <div><Label>Escopo Detalhado</Label><Textarea value={nOS.escopo} onChange={e => setNOS(p => ({ ...p, escopo: e.target.value }))} placeholder="Detalhamento do escopo, entregas esperadas... (opcional)" rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Valor Total (R$) <span className="text-red-500">*</span></Label><div className="relative"><DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input type="number" step="0.01" min="0" value={nOS.valor} onChange={e => setNOS(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" className="pl-9" /></div></div>
              <div><Label>Responsavel Tecnico</Label><Input value={nOS.resp} onChange={e => setNOS(p => ({ ...p, resp: e.target.value }))} placeholder="Nome do responsavel" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data de Abertura</Label><Input type="date" value={nOS.dAb} onChange={e => setNOS(p => ({ ...p, dAb: e.target.value }))} /></div>
              <div><Label>Data Prazo</Label><Input type="date" value={nOS.dPr} onChange={e => setNOS(p => ({ ...p, dPr: e.target.value }))} /></div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2"><Send className="h-4 w-4 mt-0.5 shrink-0" /><span>A OS sera enviada automaticamente para aprovacao apos a criacao.</span></div>
        </div>}
        <DialogFooter>
          {step === 0 && <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>}
          {step === 1 && <><Button variant="outline" onClick={() => setStep(0)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button><Button onClick={saveOS} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Criar e Enviar para Aprovacao</Button></>}
        </DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={showDet} onOpenChange={setShowDet}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-3">Detalhes - {sel?.numero_os ?? 'OS'}{sel && <Badge variant="secondary" className={SC[sel.status] ?? ''}>{SL[sel.status] ?? sel.status}</Badge>}</DialogTitle></DialogHeader>
        {sel && <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-muted-foreground text-xs">No OS</Label><p className="font-medium">{sel.numero_os}</p></div>
            <div><Label className="text-muted-foreground text-xs">Contrato</Label><p className="font-medium">{sel.numero_contrato}</p><p className="text-xs text-muted-foreground">{sel.fornecedor_nome}</p></div>
            <div><Label className="text-muted-foreground text-xs">Valor Total</Label><p className="font-medium text-lg">{formatarMoeda(sel.valor_total)}</p></div>
            <div><Label className="text-muted-foreground text-xs">Saldo OS</Label><p className={`font-medium text-lg ${sel.saldo_os >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatarMoeda(sel.saldo_os)}</p></div>
            <div><Label className="text-muted-foreground text-xs">Data Abertura</Label><p>{formatarData(sel.data_abertura)}</p></div>
            <div><Label className="text-muted-foreground text-xs">Data Prazo</Label><p>{formatarData(sel.data_prazo)}</p></div>
            {sel.data_entrega && <div><Label className="text-muted-foreground text-xs">Data Entrega</Label><p>{formatarData(sel.data_entrega)}</p></div>}
            {sel.responsavel_tecnico && <div><Label className="text-muted-foreground text-xs">Responsavel Tecnico</Label><p>{sel.responsavel_tecnico}</p></div>}
            {sel.usuario_cadastro_nome && <div><Label className="text-muted-foreground text-xs">Criado por</Label><p>{sel.usuario_cadastro_nome}</p></div>}
            {sel.aprovador_nome && <div><Label className="text-muted-foreground text-xs">Aprovador</Label><p>{sel.aprovador_nome}</p></div>}
            {sel.data_aprovacao && <div><Label className="text-muted-foreground text-xs">Data Aprovacao</Label><p>{formatarData(sel.data_aprovacao)}</p></div>}
          </div>
          {sel.sla_excedido && <Badge variant="destructive">SLA Excedido</Badge>}
          {sel.descricao && <div><Label className="text-muted-foreground text-xs">Descricao</Label><p className="whitespace-pre-wrap text-sm bg-gray-50 rounded-md p-3 mt-1">{sel.descricao}</p></div>}
          {sel.escopo_detalhado && <div><Label className="text-muted-foreground text-xs">Escopo Detalhado</Label><p className="whitespace-pre-wrap text-sm bg-gray-50 rounded-md p-3 mt-1">{sel.escopo_detalhado}</p></div>}
          {sel.observacao_aprovador && <div><Label className="text-muted-foreground text-xs">Observacao Aprovador</Label><p className="whitespace-pre-wrap text-sm bg-yellow-50 border border-yellow-200 rounded-md p-3 mt-1">{sel.observacao_aprovador}</p></div>}
          <div className="flex gap-2 pt-4 border-t">
            {(sel.status === 'RASCUNHO' || sel.status === 'REJEITADA') && <Button onClick={() => submitOS(sel.id)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar para Aprovacao</Button>}
            {!['CANCELADA','CONCLUIDA','ACEITA'].includes(sel.status) && <Button variant="destructive" onClick={() => cancelOS(sel.id)} disabled={saving}><XCircle className="mr-2 h-4 w-4" />Cancelar OS</Button>}
          </div>
        </div>}
      </DialogContent></Dialog>
    </ModuleGuard>
  );
}
export default OrdensServicoPage;
