'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Fingerprint, PenLine, Clock, CheckCircle, Eye, Download, MoreHorizontal, FileText } from 'lucide-react';
import Link from 'next/link';
import { assinadorGet } from '@/lib/assinador-api';
import { useAssinador } from '@/components/assinador/AssinadorContext';
import { KpiCard } from '@/components/assinador/KpiCard';
import { StatusChip } from '@/components/assinador/StatusChip';
import { SignatariosAvatarStack } from '@/components/assinador/SignatariosAvatarStack';
import { ProgressBar } from '@/components/assinador/ProgressBar';

interface Documento {
  id: string;
  titulo: string;
  status: string;
  documento_hash: string;
  arquivo_original_url: string;
  arquivo_assinado_url: string;
  created_at: string;
  signatarios: Array<{ nome: string; status: string; email: string }>;
}

type Filtro = 'todos' | 'para_assinar' | 'em_andamento' | 'concluidos';

function PdfFileIcon({ tone }: { tone: 'blue' | 'warn' | 'ok' | 'neutral' }) {
  const colors = {
    blue:    { bg: '#EEF4FF', stroke: '#1F5EDC' },
    warn:    { bg: '#FFF6E5', stroke: '#C77800' },
    ok:      { bg: '#E8F7EE', stroke: '#1F8A4F' },
    neutral: { bg: '#EFF1F4', stroke: '#8A91A0' },
  };
  const c = colors[tone];
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-none relative" style={{ background: c.bg }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span className="absolute bottom-0.5 right-0.5 text-[6px] font-bold text-white px-0.5 rounded-sm" style={{ background: c.stroke }}>PDF</span>
    </div>
  );
}

export default function PainelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtroParam = (searchParams.get('filtro') || 'todos') as Filtro;
  const { kpis, refreshKpis } = useAssinador();

  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>(filtroParam);

  const carregarDocs = useCallback(async () => {
    try {
      const data = await assinadorGet<Documento[]>('/api/assinador');
      setDocs(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDocs();
    refreshKpis();
  }, [carregarDocs, refreshKpis]);

  useEffect(() => {
    setFiltro(filtroParam);
  }, [filtroParam]);

  const filtrados = docs.filter(d => {
    if (filtro === 'para_assinar') return d.status === 'AGUARDANDO_ASSINATURAS';
    if (filtro === 'em_andamento') return d.status === 'AGUARDANDO_ASSINATURAS';
    if (filtro === 'concluidos') return d.status === 'CONCLUIDO';
    return true;
  });

  const pendentes = docs.filter(d => d.status === 'AGUARDANDO_ASSINATURAS');

  function docTone(d: Documento): 'blue' | 'warn' | 'ok' | 'neutral' {
    if (d.status === 'CONCLUIDO') return 'ok';
    if (d.status === 'AGUARDANDO_ASSINATURAS') return 'warn';
    return 'blue';
  }

  const setFiltroAndUrl = (f: Filtro) => {
    setFiltro(f);
    const url = f === 'todos' ? '/assinador/painel' : `/assinador/painel?filtro=${f}`;
    router.push(url, { scroll: false });
  };

  const TABS: { key: Filtro; label: string; count: number }[] = [
    { key: 'todos', label: 'Todos', count: docs.length },
    { key: 'para_assinar', label: 'Para assinar', count: pendentes.length },
    { key: 'em_andamento', label: 'Em andamento', count: docs.filter(d => d.status === 'AGUARDANDO_ASSINATURAS').length },
    { key: 'concluidos', label: 'Concluídos', count: docs.filter(d => d.status === 'CONCLUIDO').length },
  ];

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-[#0E1015] tracking-tight">Painel de assinaturas</h1>
          <p className="text-sm text-[#5F6675] mt-1">Tudo que precisa da sua atenção em um só lugar.</p>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <Link
            href="/assinador/verificar"
            className="flex items-center gap-2 h-10 px-4 bg-white border border-[#D6DAE1] rounded-xl text-sm font-semibold text-[#424957] hover:border-[#B8BDC7] hover:bg-[#F7F8FA] transition-colors shadow-sm"
          >
            <Fingerprint size={15} /> Verificar PDF assinado
          </Link>
          <Link
            href="/assinador/novo"
            className="flex items-center gap-2 h-10 px-4 bg-[#1351B4] hover:bg-[#0E3F8C] text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus size={15} /> Novo documento
          </Link>
        </div>
      </div>

      {/* KPI row */}
      {filtro === 'todos' && (
        <div className="grid grid-cols-3 gap-4">
          <KpiCard
            variant="info"
            icon={<PenLine size={22} />}
            label="Sua vez de assinar"
            value={kpis.sua_vez}
            hint={kpis.sua_vez > 0 ? 'Toque em um documento para assinar' : 'Nada pendente — você está em dia'}
            ctaLabel={kpis.sua_vez > 0 ? 'Ver documentos' : undefined}
            onCta={() => setFiltroAndUrl('para_assinar')}
          />
          <KpiCard
            variant="warn"
            icon={<Clock size={22} />}
            label="Aguardando outros"
            value={kpis.aguardando_outros}
            hint="Outros signatários ainda não concluíram"
            ctaLabel={kpis.aguardando_outros > 0 ? 'Acompanhar' : undefined}
            onCta={() => setFiltroAndUrl('em_andamento')}
          />
          <KpiCard
            variant="ok"
            icon={<CheckCircle size={22} />}
            label="Concluídos · 30 dias"
            value={kpis.concluidos_30d}
            hint="Disponíveis para download"
            ctaLabel={kpis.concluidos_30d > 0 ? 'Ver tudo' : undefined}
            onCta={() => setFiltroAndUrl('concluidos')}
          />
        </div>
      )}

      {/* Urgent section */}
      {filtro === 'todos' && pendentes.length > 0 && (
        <div className="bg-gradient-to-br from-[#FFF6E5] to-[#FEF3CD] border border-[#FCC97B] rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3.5 px-5 py-4">
            <span className="w-3 h-3 rounded-full bg-[#C77800] animate-pulse flex-none" />
            <div>
              <div className="font-bold text-[15px] text-[#1A1D24]">Sua vez de assinar</div>
              <div className="text-sm text-[#8A91A0] mt-0.5">Estes documentos estão esperando por você</div>
            </div>
          </div>
          {pendentes.map(d => {
            const signed = d.signatarios.filter(s => s.status === 'ASSINADO').length;
            return (
              <div key={d.id} className="flex items-center gap-4 px-5 py-4 bg-white border-t border-[#FCC97B]/30">
                <PdfFileIcon tone="warn" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[#1A1D24] truncate">{d.titulo}</div>
                  <div className="text-xs text-[#8A91A0] mt-1">
                    {new Date(d.created_at).toLocaleDateString('pt-BR')} · {d.signatarios.length} signatários
                  </div>
                </div>
                <SignatariosAvatarStack signatarios={d.signatarios} />
                <div className="text-xs text-[#8A91A0] text-right min-w-[60px]">{signed}/{d.signatarios.length} assinaram</div>
                <Link
                  href={`/assinador/documento/${d.id}/assinar`}
                  className="flex items-center gap-1.5 h-9 px-4 bg-[#1351B4] hover:bg-[#0E3F8C] text-white text-sm font-semibold rounded-xl transition-colors flex-none"
                >
                  <PenLine size={14} /> Assinar agora
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setFiltroAndUrl(t.key)}
            className={`flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-semibold transition-all ${
              filtro === t.key
                ? 'bg-white text-[#1A1D24] shadow-sm border border-[#E4E7ED]'
                : 'text-[#5F6675] hover:bg-[#EFF1F4] hover:text-[#1A1D24]'
            }`}
          >
            {t.label}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              filtro === t.key ? 'bg-[#EEF4FF] text-[#1351B4]' : 'bg-[#EFF1F4] text-[#5F6675]'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Documents table */}
      <div className="bg-white border border-[#E4E7ED] rounded-2xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="grid gap-4 px-5 py-3 bg-[#F7F8FA] border-b border-[#E4E7ED]"
          style={{ gridTemplateColumns: 'minmax(280px,2fr) minmax(120px,1fr) minmax(100px,1fr) auto minmax(180px,auto)' }}>
          {['Documento', 'Signatários', 'Progresso', 'Status', ''].map((h, i) => (
            <div key={i} className="text-[11px] font-bold uppercase tracking-wider text-[#8A91A0]">{h}</div>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-[#8A91A0]">
            <div className="w-8 h-8 border-2 border-[#E4E7ED] border-t-[#1351B4] rounded-full animate-spin mx-auto mb-3" />
            Carregando documentos...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-[#EFF1F4] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-[#8A91A0]" />
            </div>
            <h3 className="font-semibold text-[#1A1D24] mb-1">Nenhum documento aqui</h3>
            <p className="text-sm text-[#8A91A0] mb-5">
              {filtro === 'para_assinar' ? 'Você está em dia. Quando alguém pedir sua assinatura, aparecerá aqui.' : 'Comece enviando um PDF para assinatura.'}
            </p>
            <Link
              href="/assinador/novo"
              className="inline-flex items-center gap-2 h-10 px-5 bg-[#1351B4] text-white text-sm font-semibold rounded-xl hover:bg-[#0E3F8C] transition-colors"
            >
              <Plus size={15} /> Novo documento
            </Link>
          </div>
        ) : filtrados.map(d => {
          const signed = d.signatarios.filter(s => s.status === 'ASSINADO').length;
          return (
            <div
              key={d.id}
              className="grid gap-4 px-5 py-4 border-b border-[#EFF1F4] hover:bg-[#EEF4FF]/30 transition-colors last:border-none items-center"
              style={{ gridTemplateColumns: 'minmax(280px,2fr) minmax(120px,1fr) minmax(100px,1fr) auto minmax(180px,auto)' }}
            >
              {/* Doc info */}
              <div className="flex items-center gap-3 min-w-0">
                <PdfFileIcon tone={docTone(d)} />
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-[#1A1D24] truncate">{d.titulo}</div>
                  <div className="text-[11px] text-[#8A91A0] mt-0.5 flex items-center gap-1.5">
                    <span>{new Date(d.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>

              {/* Signatarios */}
              <SignatariosAvatarStack signatarios={d.signatarios} />

              {/* Progress */}
              <ProgressBar current={signed} total={d.signatarios.length} />

              {/* Status */}
              <StatusChip status={d.status} size="sm" />

              {/* Actions */}
              <div className="flex items-center gap-2 justify-end">
                {d.status === 'AGUARDANDO_ASSINATURAS' && (
                  <>
                    <Link
                      href={`/assinador/documento/${d.id}/assinar`}
                      className="flex items-center gap-1.5 h-8 px-3 bg-[#1351B4] hover:bg-[#0E3F8C] text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <PenLine size={12} /> Assinar
                    </Link>
                    <Link
                      href={`/assinador/documento/${d.id}/acompanhar`}
                      className="flex items-center gap-1.5 h-8 px-3 bg-white border border-[#D6DAE1] text-[#424957] text-xs font-semibold rounded-lg hover:bg-[#F7F8FA] transition-colors"
                    >
                      <Eye size={12} /> Acompanhar
                    </Link>
                  </>
                )}
                {d.status === 'CONCLUIDO' && (
                  <>
                    <Link
                      href={`/assinador/documento/${d.id}/acompanhar`}
                      className="flex items-center gap-1.5 h-8 px-3 bg-white border border-[#D6DAE1] text-[#424957] text-xs font-semibold rounded-lg hover:bg-[#F7F8FA] transition-colors"
                    >
                      <Eye size={12} />
                    </Link>
                    {d.arquivo_assinado_url && (
                      <a
                        href={`/api/${d.arquivo_assinado_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 h-8 px-3 bg-[#1351B4] hover:bg-[#0E3F8C] text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        <Download size={12} /> Baixar
                      </a>
                    )}
                  </>
                )}
                <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#EFF1F4] text-[#8A91A0]">
                  <MoreHorizontal size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
