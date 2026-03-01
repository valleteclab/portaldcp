'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Download,
  Package,
  Loader2,
  ArrowLeft,
  Upload,
  CheckCircle,
  FileCheck,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch, formatarDataBR } from '@/lib/api';

interface DossieItem {
  ordem_id: string;
  ordem_numero: string;
  contrato_numero: string;
  fornecedor: string;
  data_emissao: string;
  valor_total: number;
  tem_of_pdf: boolean;
  tem_nf: boolean;
  tem_comprovacao: boolean;
  recebimentos: Array<{ id: string; numero: string; tem_comprovacao: boolean }>;
  nfs?: Array<{ id: string; numero: string; filename_pdf: string | null; filename_xml: string | null }>;
  anexos_count: number;
  entregue_financeiro_em: string | null;
}

function DossieFiscalContent() {
  const [dossies, setDossies] = useState<DossieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordemDetalhe, setOrdemDetalhe] = useState<DossieItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [baixandoZip, setBaixandoZip] = useState<string | null>(null);
  const [marcandoEntregue, setMarcandoEntregue] = useState<string | null>(null);

  useEffect(() => {
    carregarDossies();
  }, []);

  const carregarDossies = async () => {
    try {
      setLoading(true);
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/dossie-fiscal`);
      if (res.ok) {
        const data = await res.json();
        setDossies(data);
      } else {
        setDossies([]);
      }
    } catch (e) {
      console.error(e);
      setDossies([]);
    } finally {
      setLoading(false);
    }
  };

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

  const abrirDocumentoEmNovaAba = (blob: Blob, nome: string) => {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  };

  const handleVisualizarOF = async (ordemId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/pdf`);
      if (res.ok) {
        const blob = await res.blob();
        abrirDocumentoEmNovaAba(blob, 'OF');
      } else {
        alert('OF não disponível');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao visualizar OF');
    }
  };

  const handleDownloadOF = async (ordemId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/pdf`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OF_${ordemId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao baixar OF');
    }
  };

  const handleVisualizarComprovacao = async (recebimentoId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimentoId}/comprovacao-aceite`);
      if (res.ok) {
        const blob = await res.blob();
        abrirDocumentoEmNovaAba(blob, 'Comprovação');
      } else {
        alert('Comprovação não disponível');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao visualizar comprovação');
    }
  };

  const handleDownloadComprovacao = async (recebimentoId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimentoId}/comprovacao-aceite`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ComprovacaoAceite_${recebimentoId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Comprovação não disponível');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao baixar comprovação');
    }
  };

  const handleVisualizarNF = async (filename: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/uploads/notas-fiscais/${filename}`);
      if (res.ok) {
        const blob = await res.blob();
        abrirDocumentoEmNovaAba(blob, 'NF');
      } else {
        alert('NF não disponível');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao visualizar NF');
    }
  };

  const handleDownloadZip = async (ordem: DossieItem) => {
    setBaixandoZip(ordem.ordem_id);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordem.ordem_id}/dossie/zip`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Dossie_${ordem.ordem_numero.replace(/\//g, '_')}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Erro ao gerar ZIP');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao baixar dossiê');
    } finally {
      setBaixandoZip(null);
    }
  };

  const handleUploadAnexo = async (ordemId: string, file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/dossie/anexos`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        alert('Anexo enviado com sucesso!');
        setShowUpload(false);
        carregarDossies();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.message || 'Erro ao enviar anexo'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao enviar anexo');
    } finally {
      setUploading(false);
    }
  };

  const handleMarcarEntregue = async (ordemId: string) => {
    setMarcandoEntregue(ordemId);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/dossie/entregue-financeiro`, {
        method: 'POST',
      });
      if (res.ok) {
        alert('Marcado como entregue ao financeiro!');
        carregarDossies();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.message || 'Erro ao marcar'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao marcar');
    } finally {
      setMarcandoEntregue(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orgao/almoxarifado">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dossiê do Fiscal</h1>
            <p className="text-gray-500">
              Ordens com recebimento aceito. Baixe os documentos e entregue ao financeiro.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Ordens com Dossiê Disponível
          </CardTitle>
          <CardDescription>
            Para cada ordem: OF, Nota Fiscal, Comprovação de Aceite. Você pode anexar documentos adicionais e baixar tudo em ZIP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dossies.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum dossiê disponível no momento.</p>
              <p className="text-sm mt-2">
                Os dossiês aparecem aqui quando uma ordem tem recebimento totalmente aceito.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Documentos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossies.map((d) => (
                  <TableRow key={d.ordem_id}>
                    <TableCell className="font-medium">{d.ordem_numero}</TableCell>
                    <TableCell>{d.contrato_numero}</TableCell>
                    <TableCell>{d.fornecedor}</TableCell>
                    <TableCell>{formatarDataBR(d.data_emissao)}</TableCell>
                    <TableCell>{formatarMoeda(d.valor_total)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {d.tem_of_pdf && (
                          <Badge
                            variant="outline"
                            className="text-green-700 cursor-pointer hover:bg-green-50"
                            onClick={() => handleVisualizarOF(d.ordem_id)}
                            title="Visualizar OF"
                          >
                            <Eye className="h-3 w-3 mr-0.5 inline" /> OF
                          </Badge>
                        )}
                        {d.tem_nf && ((d.nfs || []).length > 0 ? (d.nfs || []).map((nf) => (
                          nf.filename_pdf ? (
                            <Badge
                              key={nf.id}
                              variant="outline"
                              className="text-blue-700 cursor-pointer hover:bg-blue-50"
                              onClick={() => handleVisualizarNF(nf.filename_pdf!)}
                              title={`Visualizar NF ${nf.numero || ''}`}
                            >
                              <Eye className="h-3 w-3 mr-0.5 inline" /> NF {nf.numero ? ` ${nf.numero}` : ''}
                            </Badge>
                          ) : nf.filename_xml ? (
                            <Badge
                              key={nf.id}
                              variant="outline"
                              className="text-blue-700 cursor-pointer hover:bg-blue-50"
                              onClick={() => handleVisualizarNF(nf.filename_xml!)}
                              title={`Visualizar NF XML ${nf.numero || ''}`}
                            >
                              <Eye className="h-3 w-3 mr-0.5 inline" /> NF {nf.numero ? ` ${nf.numero}` : ''}
                            </Badge>
                          ) : (
                            <Badge key={nf.id} variant="outline" className="text-blue-700">NF {nf.numero || ''}</Badge>
                          )
                        )) : (
                          <Badge variant="outline" className="text-blue-700">NF</Badge>
                        ))}
                        {d.recebimentos.filter((r) => r.tem_comprovacao).map((r) => (
                          <Badge
                            key={r.id}
                            variant="outline"
                            className="text-purple-700 cursor-pointer hover:bg-purple-50"
                            onClick={() => handleVisualizarComprovacao(r.id)}
                            title={`Visualizar Comprovação ${r.numero}`}
                          >
                            <Eye className="h-3 w-3 mr-0.5 inline" /> Comprov. {r.numero}
                          </Badge>
                        ))}
                        {d.anexos_count > 0 && <Badge variant="secondary">+{d.anexos_count} anexo(s)</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadZip(d)}
                          disabled={baixandoZip === d.ordem_id}
                          title="Baixar ZIP com todos os documentos"
                        >
                          {baixandoZip === d.ordem_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setOrdemDetalhe(d);
                            setShowUpload(true);
                          }}
                          title="Anexar documento"
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        {!d.entregue_financeiro_em && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600"
                            onClick={() => handleMarcarEntregue(d.ordem_id)}
                            disabled={marcandoEntregue === d.ordem_id}
                            title="Marcar como entregue ao financeiro"
                          >
                            {marcandoEntregue === d.ordem_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {d.entregue_financeiro_em && (
                          <Badge variant="secondary" className="text-xs">
                            Entregue
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Detalhe + Upload */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anexar Documento ao Dossiê</DialogTitle>
            <DialogDescription>
              {ordemDetalhe && (
                <>Ordem {ordemDetalhe.ordem_numero} — {ordemDetalhe.fornecedor}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {ordemDetalhe && (
            <div className="space-y-4">
              <div className="border rounded p-4 space-y-2">
                <p className="font-medium">Documentos disponíveis (clique para visualizar ou baixar):</p>
                <div className="flex flex-wrap gap-2">
                  {ordemDetalhe.tem_of_pdf && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleVisualizarOF(ordemDetalhe.ordem_id)} title="Visualizar">
                        <Eye className="h-4 w-4 mr-1" /> Ver OF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownloadOF(ordemDetalhe.ordem_id)} title="Baixar">
                        <Download className="h-4 w-4 mr-1" /> OF
                      </Button>
                    </div>
                  )}
                  {ordemDetalhe.recebimentos.map((r) =>
                    r.tem_comprovacao ? (
                      <div key={r.id} className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleVisualizarComprovacao(r.id)} title="Visualizar">
                          <Eye className="h-4 w-4 mr-1" /> Ver Comprov. {r.numero}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDownloadComprovacao(r.id)} title="Baixar">
                          <Download className="h-4 w-4 mr-1" /> Comprov. {r.numero}
                        </Button>
                      </div>
                    ) : null,
                  )}
                  {(ordemDetalhe.nfs || []).filter((nf) => nf.filename_pdf || nf.filename_xml).map((nf) => {
                    const fname = nf.filename_pdf || nf.filename_xml;
                    return fname ? (
                      <Button
                        key={nf.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleVisualizarNF(fname)}
                        title="Visualizar NF"
                      >
                        <Eye className="h-4 w-4 mr-1" /> Ver NF {nf.numero || ''}
                      </Button>
                    ) : null;
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Enviar arquivo adicional (PDF, etc.):</label>
                <input
                  type="file"
                  className="mt-2 block w-full text-sm"
                  accept=".pdf,.doc,.docx,.xml,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadAnexo(ordemDetalhe.ordem_id, f);
                  }}
                  disabled={uploading}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DossieFiscalPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <DossieFiscalContent />
    </ModuleGuard>
  );
}
