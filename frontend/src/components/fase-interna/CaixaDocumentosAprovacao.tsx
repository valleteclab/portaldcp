"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle, Eye, FileCheck, FileText, Loader2, PenLine, XCircle } from 'lucide-react';
import { API_URL, authFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDialogoConfirmacao } from '@/components/licitacao/useDialogoConfirmacao';
import { rotaFazerAqui } from "@/lib/fase-interna/telas"
import { abrirArquivoAutenticado } from '@/lib/arquivo-autenticado';

interface EtapaDaCaixa {
  id: string;
  licitacao_id: string;
  documento_id: string;
  ordem: number;
  total: number;
  nome: string;
  rotulo: string;
  responsavel: string;
  exige_assinatura: boolean;
  assina_ao_aprovar: boolean;
  created_at: string;
  submetido_por_nome?: string | null;
  automatica?: boolean;
  documento: { id: string; titulo: string; tipo: string; tipo_titulo: string; status: string; versao: number; origem: string; tem_arquivo: boolean };
  processo: { numero_processo?: string | null; objeto?: string | null };
}

// ─── Caixa de DOCUMENTOS (fluxos de aprovação da fase interna) ──────────────
// Cada um vê só as etapas que são dele: indicadas a ele, ao setor dele ou —
// sem responsável — dos processos que ele conduz. Quem decide é sempre o
// usuário do login (o servidor confere; etapa de outra pessoa → 403).
export function CaixaDocumentosAprovacao() {
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao();
  const [etapas, setEtapas] = useState<EtapaDaCaixa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const carregarCaixa = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/aprovacoes/caixa`, { cache: 'no-store' });
      if (res.ok) setEtapas(await res.json());
    } catch { /* lista fica vazia */ }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregarCaixa(); }, [carregarCaixa]);

  const decidir = async (etapa: EtapaDaCaixa, aprovar: boolean) => {
    let justificativa: string | undefined;
    const doc = etapa.documento?.titulo || etapa.documento?.tipo_titulo;
    if (!aprovar) {
      const j = await pedirTexto({
        titulo: 'Reprovar',
        mensagem: `"${doc}" volta para quem fez a peça, com o motivo, para corrigir. Depois de corrigida, ela volta sozinha para a aprovação.`,
        rotulo: 'Motivo da reprovação',
        obrigatorio: true,
        confirmarRotulo: 'Reprovar',
        destrutivo: true,
      });
      if (!j) return;
      justificativa = j;
    } else if (!(await confirmar({
      titulo: etapa.assina_ao_aprovar ? 'Aprovar e assinar' : 'Aprovar',
      mensagem: etapa.assina_ao_aprovar
        ? `Esta é a última etapa e ela pede assinatura: ao aprovar, você assina "${doc}" com o seu login (portal de assinaturas) e a peça passa a valer.`
        : etapa.ordem < etapa.total
          ? `Aprovar a etapa "${etapa.nome}" de "${doc}"? A peça segue para a próxima etapa (${etapa.ordem + 1} de ${etapa.total}).`
          : `Aprovar "${doc}"? É a última etapa: a peça passa a valer.`,
      confirmarRotulo: etapa.assina_ao_aprovar ? 'Aprovar e assinar' : 'Aprovar',
    }))) {
      return;
    }
    setDecidindo(etapa.id);
    try {
      const res = await authFetch(
        `${API_URL}/api/fase-interna/aprovacoes/etapa/${etapa.id}/${aprovar ? 'aprovar' : 'reprovar'}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ justificativa }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(err.message) ? err.message.join(' ') : err.message || `HTTP ${res.status}`);
      }
      const r = await res.json().catch(() => ({}));
      toast.success(
        !aprovar
          ? 'Reprovada: a peça voltou para quem a fez, com o motivo.'
          : r?.assinada
            ? 'Aprovada e assinada: a peça passou a valer.'
            : r?.documentoAprovado
              ? 'Aprovada: a peça passou a valer.'
              : 'Aprovada: a peça seguiu para a próxima etapa.',
      );
      await carregarCaixa();
    } catch (e: any) {
      toast.error(e.message);
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
        <CardContent className="py-12 text-center text-gray-600">
          <FileCheck className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          Nenhuma peça aguardando a sua aprovação.
          <p className="text-xs text-gray-500 mt-2">
            As peças chegam aqui quando a etapa tem &quot;aprovação interna&quot; ligada e você (ou o seu setor) está no fluxo — veja em{' '}
            <Link className="text-blue-800 hover:underline" href="/orgao/configuracoes/fluxos-aprovacao">Configurações › Fluxos de aprovação</Link>.
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
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900">{etapa.documento?.titulo || etapa.documento?.tipo_titulo}</h3>
                  <Badge variant="outline">{etapa.documento?.tipo_titulo || etapa.documento?.tipo}</Badge>
                  <Badge className="bg-indigo-100 text-indigo-800 border-0">
                    Etapa {etapa.ordem} de {etapa.total}: {etapa.nome}
                  </Badge>
                  {etapa.assina_ao_aprovar && (
                    <Badge className="bg-purple-100 text-purple-800 border-0 gap-1">
                      <PenLine className="w-3 h-3" /> aprovar = assinar
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-700">
                  Processo {etapa.processo?.numero_processo ?? '—'}
                  {etapa.processo?.objeto ? ` · ${etapa.processo.objeto.length > 90 ? `${etapa.processo.objeto.slice(0, 87)}…` : etapa.processo.objeto}` : ''}
                </p>
                <p className="text-xs text-gray-600">
                  {etapa.submetido_por_nome ? `Enviada por ${etapa.submetido_por_nome}${etapa.automatica ? ' (ao gerar/anexar a peça)' : ''} · ` : ''}
                  aguardando desde {new Date(etapa.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Button size="sm" variant="ghost" asChild>
                  <Link href={rotaFazerAqui(etapa.licitacao_id, etapa.documento?.tipo ?? "")}>
                    <Eye className="h-4 w-4 mr-1" /> Abrir a peça
                  </Link>
                </Button>
                {etapa.documento?.tem_arquivo && (
                  <Button size="sm" variant="ghost" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${etapa.documento_id}/arquivo`)}>
                    <FileText className="h-4 w-4 mr-1" /> Ver PDF
                  </Button>
                )}
                <Button size="sm" className="bg-green-600 hover:bg-green-700"
                  onClick={() => decidir(etapa, true)} disabled={decidindo === etapa.id}>
                  {decidindo === etapa.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : etapa.assina_ao_aprovar ? <PenLine className="h-4 w-4 mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  {etapa.assina_ao_aprovar ? 'Aprovar e assinar' : 'Aprovar'}
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
