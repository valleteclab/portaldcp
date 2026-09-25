"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle, Eye, FileCheck, Loader2, XCircle } from 'lucide-react';
import { API_URL, authFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDialogoConfirmacao } from '@/components/licitacao/useDialogoConfirmacao';

// ─── Caixa de DOCUMENTOS em tramitação (fluxos de aprovação da fase interna) ──
// O aprovador vê aqui os documentos parados na SUA etapa (por usuário, setor
// ou etapas sem responsável definido) e decide sem sair da central.
export function CaixaDocumentosAprovacao() {
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao();
  const [etapas, setEtapas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const usuarioLocal = (() => {
    try { return JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { return null; }
  })();
  const orgaoLocal = (() => {
    try { return JSON.parse(localStorage.getItem('orgao') || 'null'); } catch { return null; }
  })();

  const carregarCaixa = async () => {
    setCarregando(true);
    try {
      const usuarioId = usuarioLocal?.id || orgaoLocal?.id;
      const setorId = usuarioLocal?.setor_id || '';
      const res = await authFetch(
        `${API_URL}/api/fase-interna/aprovacoes/caixa?usuarioId=${usuarioId || ''}${setorId ? `&setorId=${setorId}` : ''}`,
      );
      if (res.ok) setEtapas(await res.json());
    } catch { /* lista fica vazia */ }
    finally { setCarregando(false); }
  };

  useEffect(() => { carregarCaixa(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const decidir = async (etapa: any, aprovar: boolean) => {
    let justificativa: string | undefined;
    const doc = etapa.documento?.titulo || etapa.documento_id;
    if (!aprovar) {
      const j = await pedirTexto({
        titulo: 'Reprovar etapa',
        mensagem: `"${doc}" volta para o elaborador corrigir e reenviar.`,
        rotulo: 'Motivo da reprovação',
        obrigatorio: true,
        confirmarRotulo: 'Reprovar',
        destrutivo: true,
      });
      if (!j) return;
      justificativa = j;
    } else if (!(await confirmar({
      titulo: 'Aprovar etapa',
      mensagem: `Aprovar a etapa "${etapa.nome}" do documento "${doc}"?`,
      confirmarRotulo: 'Aprovar',
    }))) {
      return;
    }
    setDecidindo(etapa.id);
    try {
      const res = await authFetch(
        `${API_URL}/api/fase-interna/aprovacoes/etapa/${etapa.id}/${aprovar ? 'aprovar' : 'reprovar'}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usuarioId: usuarioLocal?.id,
            usuarioNome: usuarioLocal?.nome || orgaoLocal?.nome || 'Aprovador',
            justificativa,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      await carregarCaixa();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setDecidindo(null);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }
  if (etapas.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          <FileCheck className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          Nenhum documento aguardando a sua aprovação.
          <p className="text-xs text-gray-400 mt-2">
            Os fluxos de tramitação são configurados em Configurações → Fluxos de aprovação.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {dialogo}
      {etapas.map((etapa) => (
        <Card key={etapa.id}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-gray-900">{etapa.documento?.titulo || 'Documento'}</h3>
                  <Badge variant="outline">{etapa.documento?.tipo}</Badge>
                  <Badge className="bg-indigo-100 text-indigo-800">
                    Etapa {etapa.ordem}: {etapa.nome}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">
                  {etapa.setor_nome ? `Setor: ${etapa.setor_nome} · ` : ''}
                  {etapa.usuario_nome ? `Responsável: ${etapa.usuario_nome} · ` : ''}
                  Aguardando desde {new Date(etapa.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/orgao/fase-interna/processos/${etapa.licitacao_id}/editor?tipo=${etapa.documento?.tipo}`}>
                    <Eye className="h-4 w-4 mr-1" /> Ver documento
                  </Link>
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700"
                  onClick={() => decidir(etapa, true)} disabled={decidindo === etapa.id}>
                  {decidindo === etapa.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  Aprovar etapa
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => decidir(etapa, false)} disabled={decidindo === etapa.id}>
                  <XCircle className="h-4 w-4 mr-1" /> Reprovar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
