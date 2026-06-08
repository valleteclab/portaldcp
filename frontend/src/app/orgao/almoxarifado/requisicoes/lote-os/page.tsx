'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Loader2,
  Send,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

interface Contrato {
  id: string;
  numero_contrato: string;
  objeto: string;
  categoria?: string;
  modalidade_execucao?: string;
  status: string;
  fornecedor_razao_social?: string;
  fornecedor?: { razao_social?: string };
}

interface ResultadoItem {
  contrato_id: string;
  numero_contrato?: string;
  status: 'criada' | 'pulada' | 'erro';
  numero?: string;
  requisicao_id?: string;
  motivo?: string;
}

interface ResultadoLote {
  total: number;
  criadas: number;
  puladas: number;
  erros: number;
  resultados: ResultadoItem[];
}

// Contratos elegíveis a OS (fluxo ORDEM_SERVICO com cronograma)
const MODALIDADES_OS = ['MEDICAO', 'CONTINUADO', 'ORDEM_SERVICO'];

function LoteOSContent() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [setor, setSetor] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [mes, setMes] = useState('');
  const [prioridade, setPrioridade] = useState('NORMAL');

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);

  useEffect(() => {
    carregarContratos();
  }, []);

  const carregarContratos = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/contratos?limit=500`);
      if (response.ok) {
        const json = await response.json();
        const lista: Contrato[] = Array.isArray(json) ? json : (json.data || []);
        const elegiveis = lista.filter(
          (c) =>
            (c.status === 'ATIVO' || c.status === 'VIGENTE') &&
            MODALIDADES_OS.includes((c.modalidade_execucao || '').toUpperCase()),
        );
        setContratos(elegiveis);
      }
    } catch (error) {
      console.error('Erro ao carregar contratos:', error);
    } finally {
      setLoading(false);
    }
  };

  const fornecedorNome = (c: Contrato) =>
    c.fornecedor_razao_social || c.fornecedor?.razao_social || '-';

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return contratos;
    return contratos.filter(
      (c) =>
        c.numero_contrato?.toLowerCase().includes(t) ||
        c.objeto?.toLowerCase().includes(t) ||
        fornecedorNome(c).toLowerCase().includes(t),
    );
  }, [contratos, busca]);

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const toggleTodos = () => {
    setSelecionados((prev) => {
      const todosVisiveis = filtrados.map((c) => c.id);
      const jaTodos = todosVisiveis.every((id) => prev.has(id));
      const novo = new Set(prev);
      if (jaTodos) todosVisiveis.forEach((id) => novo.delete(id));
      else todosVisiveis.forEach((id) => novo.add(id));
      return novo;
    });
  };

  const podeEnviar =
    selecionados.size > 0 && setor.trim().length > 0 && justificativa.trim().length > 0 && !enviando;

  const criarLote = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setResultado(null);
    try {
      const body = {
        contratos_ids: Array.from(selecionados),
        setor_solicitante: setor.trim(),
        justificativa: justificativa.trim(),
        mes_competencia: mes || undefined,
        prioridade,
      };
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/lote-os`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json: ResultadoLote = await res.json();
        setResultado(json);
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.message || 'Erro ao criar OS em lote.');
      }
    } catch {
      alert('Erro ao criar OS em lote.');
    } finally {
      setEnviando(false);
    }
  };

  const reiniciar = () => {
    setResultado(null);
    setSelecionados(new Set());
  };

  const badgeStatus = (status: ResultadoItem['status']) => {
    if (status === 'criada') return <Badge className="bg-green-100 text-green-800">Criada</Badge>;
    if (status === 'pulada') return <Badge className="bg-yellow-100 text-yellow-800">Pulada</Badge>;
    return <Badge className="bg-red-100 text-red-800">Erro</Badge>;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" asChild>
          <Link href="/orgao/almoxarifado/requisicoes">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-purple-600" />
            OS Mensal em Lote
          </h1>
          <p className="text-gray-500">
            Gera uma Ordem de Serviço mensal (parcial do mês) para cada contrato selecionado.
          </p>
        </div>
      </div>

      {/* Tela de RESULTADO */}
      {resultado ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Resultado do lote
            </CardTitle>
            <CardDescription>
              {resultado.criadas} criada(s) · {resultado.puladas} pulada(s) · {resultado.erros} erro(s) — de{' '}
              {resultado.total} contrato(s).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>OS / Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.resultados.map((r) => (
                    <TableRow key={r.contrato_id}>
                      <TableCell className="font-medium">{r.numero_contrato || r.contrato_id}</TableCell>
                      <TableCell>{badgeStatus(r.status)}</TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {r.status === 'criada' ? (
                          <span className="text-green-700 font-medium">{r.numero}</span>
                        ) : (
                          r.motivo || '-'
                        )}
                        {r.status === 'criada' && r.motivo ? (
                          <span className="block text-xs text-yellow-700">{r.motivo}</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={reiniciar}>
                Criar novo lote
              </Button>
              <Button asChild>
                <Link href="/orgao/almoxarifado/requisicoes">
                  <FileText className="h-4 w-4 mr-2" />
                  Ver requisições
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Dados comuns do lote */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Dados da OS (aplicados a todas)</CardTitle>
              <CardDescription>
                A mesma justificativa, setor e mês são usados em todas as OS geradas.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Setor solicitante *</Label>
                <Input
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  placeholder="Ex.: Diretoria Administrativa"
                />
              </div>
              <div>
                <Label>Mês de competência</Label>
                <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Justificativa *</Label>
                <Textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Ex.: Manutenção mensal dos contratos de serviço contínuo referente ao mês."
                  rows={3}
                />
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={prioridade} onValueChange={setPrioridade}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="URGENTE">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Seleção de contratos */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Contratos ({selecionados.size} selecionado(s))</span>
              </CardTitle>
              <CardDescription>
                Apenas contratos VIGENTES com cronograma (modalidade Medição, Continuado ou Ordem de Serviço).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por número, objeto ou fornecedor..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={toggleTodos} disabled={filtrados.length === 0}>
                  Selecionar/limpar visíveis
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                </div>
              ) : filtrados.length === 0 ? (
                <div className="text-center py-10 text-gray-500 flex flex-col items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-yellow-500" />
                  Nenhum contrato elegível encontrado.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Contrato</TableHead>
                        <TableHead>Objeto</TableHead>
                        <TableHead>Fornecedor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtrados.map((c) => (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer"
                          onClick={() => toggle(c.id)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-purple-600"
                              checked={selecionados.has(c.id)}
                              onChange={() => toggle(c.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{c.numero_contrato}</TableCell>
                          <TableCell className="text-sm text-gray-600 max-w-md truncate">{c.objeto}</TableCell>
                          <TableCell className="text-sm text-gray-600">{fornecedorNome(c)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button onClick={criarLote} disabled={!podeEnviar}>
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Gerar {selecionados.size > 0 ? `${selecionados.size} ` : ''}OS e enviar
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function LoteOSPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <LoteOSContent />
    </ModuleGuard>
  );
}
