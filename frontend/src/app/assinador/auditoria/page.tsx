'use client';
import { useEffect, useState } from 'react';
import { Download, Upload, Check } from 'lucide-react';
import Link from 'next/link';
import { assinadorGet } from '@/lib/assinador-api';

interface AuditEvent { quando: string; acao: string; pessoa: string; documento: string; documento_id: string; ip: string; }

export default function AuditoriaPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    assinadorGet<AuditEvent[]>('/api/assinador/auditoria').then(data => { setEvents(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0E1015] tracking-tight">Trilha de auditoria</h1>
          <p className="text-sm text-[#5F6675] mt-1">Todas as ações registradas no Assinador Digital — exportável a qualquer momento.</p>
        </div>
        <button className="flex items-center gap-2 h-10 px-4 bg-white border border-[#D6DAE1] rounded-xl text-sm font-semibold text-[#424957] hover:bg-[#F7F8FA] transition-colors">
          <Download size={14}/> Exportar CSV
        </button>
      </div>

      <div className="bg-white border border-[#E4E7ED] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid gap-3 px-5 py-3 bg-[#F7F8FA] border-b border-[#E4E7ED]" style={{ gridTemplateColumns: '180px 200px 1fr 1.5fr 140px' }}>
          {['Quando', 'Ação', 'Pessoa', 'Documento', 'IP'].map(h => (
            <div key={h} className="text-[10px] font-bold uppercase tracking-wider text-[#8A91A0]">{h}</div>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-[#E4E7ED] border-t-[#1351B4] rounded-full animate-spin mx-auto" />
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8A91A0]">Nenhuma atividade registrada ainda.</div>
        ) : events.map((e, i) => (
          <div key={i} className="grid gap-3 px-5 py-3 border-b border-[#EFF1F4] last:border-none items-center text-sm" style={{ gridTemplateColumns: '180px 200px 1fr 1.5fr 140px' }}>
            <div className="font-mono text-xs text-[#5F6675]">{e.quando ? new Date(e.quando).toLocaleString('pt-BR') : '—'}</div>
            <div className={`flex items-center gap-1.5 ${e.acao === 'ASSINOU' ? 'text-[#1F8A4F]' : 'text-[#1351B4]'}`}>
              {e.acao === 'ASSINOU' ? <Check size={14}/> : <Upload size={14}/>}
              {e.acao === 'ASSINOU' ? 'Assinou' : 'Criou documento'}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#DDE9FF] flex items-center justify-center text-[9px] font-bold text-[#0E3F8C] flex-none">
                {e.pessoa?.slice(0, 2).toUpperCase() || '?'}
              </div>
              <span className="truncate">{e.pessoa}</span>
            </div>
            <Link href={`/assinador/documento/${e.documento_id}/acompanhar`} className="text-[#1351B4] font-semibold hover:underline truncate">
              {e.documento}
            </Link>
            <div className="font-mono text-[11px] text-[#8A91A0]">{e.ip || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
