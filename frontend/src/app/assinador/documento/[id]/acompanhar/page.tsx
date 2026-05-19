'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Mail, FileText } from 'lucide-react';
import Link from 'next/link';
import { assinadorGet } from '@/lib/assinador-api';
import { API_URL } from '@/lib/api';
import { TimelineRow } from '@/components/assinador/TimelineRow';
import { HashBlock } from '@/components/assinador/HashBlock';
import { ProgressBar } from '@/components/assinador/ProgressBar';
import { StatusChip } from '@/components/assinador/StatusChip';

interface Signatario {
  id: string;
  nome: string;
  email?: string;
  status: string;
  data_assinatura?: string;
  ip_address?: string;
}

interface Documento {
  id: string;
  titulo: string;
  status: string;
  documento_hash: string;
  arquivo_original_url: string;
  arquivo_assinado_url?: string;
  created_at: string;
  signatarios: Signatario[];
}

export default function AcompanharPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Documento | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const data = await assinadorGet<Documento>(`/api/assinador/${id}`);
      setDoc(data);
    } catch { router.push('/assinador/painel'); }
    finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading || !doc) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#E4E7ED] border-t-[#1351B4] rounded-full animate-spin" />
    </div>
  );

  const signed = doc.signatarios.filter(s => s.status === 'ASSINADO').length;
  const pdfUrl = doc.arquivo_assinado_url
    ? `${API_URL}/uploads/${doc.arquivo_assinado_url}`
    : doc.arquivo_original_url
    ? `${API_URL}/uploads/${doc.arquivo_original_url}`
    : null;

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
      {/* Back */}
      <Link href="/assinador/painel" className="inline-flex items-center gap-1.5 text-sm text-[#5F6675] hover:text-[#1A1D24] w-fit">
        <ArrowLeft size={15} /> Voltar ao painel
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-none ${doc.status === 'CONCLUIDO' ? 'bg-[#E8F7EE]' : 'bg-[#FFF6E5]'}`}>
            <FileText size={24} className={doc.status === 'CONCLUIDO' ? 'text-[#1F8A4F]' : 'text-[#C77800]'} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1A1D24] tracking-tight">{doc.titulo}</h1>
            <p className="text-sm text-[#8A91A0] mt-1">Criado em {new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>
            <div className="flex items-center gap-2 mt-2">
              <StatusChip status={doc.status} />
              <span className="text-xs bg-[#EFF1F4] text-[#5F6675] px-2.5 py-1 rounded-full font-medium">{doc.signatarios.length} signatários</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-none">
          {doc.status === 'AGUARDANDO_ASSINATURAS' && (
            <button className="flex items-center gap-1.5 h-9 px-4 bg-white border border-[#D6DAE1] rounded-xl text-sm font-semibold text-[#424957] hover:bg-[#F7F8FA] transition-colors">
              <Mail size={14}/> Reenviar lembrete
            </button>
          )}
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-9 px-4 bg-[#1351B4] text-white rounded-xl text-sm font-semibold hover:bg-[#0E3F8C] transition-colors">
              <Download size={14}/> {doc.status === 'CONCLUIDO' ? 'Baixar PDF assinado' : 'Baixar original'}
            </a>
          )}
        </div>
      </div>

      {/* Progress */}
      {doc.status === 'AGUARDANDO_ASSINATURAS' && (
        <div className="bg-white border border-[#E4E7ED] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[#424957]">Progresso das assinaturas</span>
            <span className="text-sm text-[#8A91A0]">{signed} de {doc.signatarios.length}</span>
          </div>
          <ProgressBar current={signed} total={doc.signatarios.length} />
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 340px' }}>
        {/* Timeline */}
        <div className="bg-white border border-[#E4E7ED] rounded-2xl p-6">
          <h3 className="font-bold text-[#1A1D24] mb-5">Trilha de assinaturas</h3>
          {doc.signatarios.map((s, i) => (
            <TimelineRow key={s.id} signatario={s} ordem={i + 1} isLast={i === doc.signatarios.length - 1} />
          ))}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-[#E4E7ED] rounded-2xl p-5">
            <HashBlock hash={doc.documento_hash || ''} />
          </div>
          <div className="bg-white border border-[#E4E7ED] rounded-2xl p-5">
            <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider mb-3">Eventos</div>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2 text-[#424957]">
                <span className="text-[#8A91A0]">📤</span> Documento criado
                <span className="ml-auto text-xs text-[#8A91A0]">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
              </li>
              <li className="flex items-center gap-2 text-[#424957]">
                <span className="text-[#1351B4]">📧</span> Convites enviados a {doc.signatarios.length} pessoas
              </li>
              {doc.signatarios.filter(s => s.status === 'ASSINADO').map(s => (
                <li key={s.id} className="flex items-center gap-2 text-[#0E6A3A]">
                  <span>✓</span> {s.nome} assinou
                  <span className="ml-auto text-xs text-[#8A91A0]">{s.data_assinatura ? new Date(s.data_assinatura).toLocaleDateString('pt-BR') : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
