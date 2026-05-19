'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, PenLine, Users, ShieldCheck, Lock } from 'lucide-react';
import Link from 'next/link';
import { assinadorGet, assinadorFetch, getAssinadorUser } from '@/lib/assinador-api';
import { API_URL } from '@/lib/api';
import { OtpModal } from '@/components/assinador/OtpModal';
import { SuccessBurst } from '@/components/assinador/SuccessBurst';
import { TimelineRow } from '@/components/assinador/TimelineRow';
import { HashBlock } from '@/components/assinador/HashBlock';
import { StatusChip } from '@/components/assinador/StatusChip';
import { SignaturePad, SignaturePadRef } from '@/components/assinador/SignaturePad';

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

export default function AssinarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = getAssinadorUser();

  const [doc, setDoc] = useState<Documento | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'sign' | 'signers' | 'integrity'>('sign');
  const [reviewed, setReviewed] = useState(false);
  const [phase, setPhase] = useState<'review' | 'otp' | 'done'>('review');
  const [canal, setCanal] = useState<string>('email');
  const sigPadRef = useRef<SignaturePadRef>(null);

  const carregar = useCallback(async () => {
    try {
      const data = await assinadorGet<Documento>(`/api/assinador/${id}`);
      setDoc(data);
    } catch { router.push('/assinador/painel'); }
    finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading || !doc) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#E4E7ED] border-t-[#1351B4] rounded-full animate-spin" />
      </div>
    );
  }

  const mySig = doc.signatarios.find(s =>
    s.email?.toLowerCase() === (user?.email || '').toLowerCase()
  ) || doc.signatarios.find(s => s.status === 'PENDENTE');

  const pdfUrl = doc.arquivo_original_url
    ? `${API_URL}/uploads/${doc.arquivo_original_url}`
    : null;

  async function handleAssinar() {
    if (!mySig) return;
    const res = await assinadorFetch(`/api/assinador/${id}/signatarios/${mySig.id}/solicitar-otp`, { method: 'POST' });
    const data = await res.json();
    if (data.otp_dispensado) {
      await assinarComCodigo();
    } else {
      setCanal(data.canal || 'email');
      setPhase('otp');
    }
  }

  async function assinarComCodigo(code?: string) {
    if (!mySig) return;
    const assinaturaImagem = sigPadRef.current?.isEmpty() ? undefined : sigPadRef.current?.toDataURL();
    const res = await assinadorFetch(`/api/assinador/${id}/signatarios/${mySig.id}/assinar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_otp: code, assinatura_imagem: assinaturaImagem }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Código inválido');
    }
    setPhase('done');
    carregar();
  }

  const signedCount = doc.signatarios.filter(s => s.status === 'ASSINADO').length;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-7">
      {/* Top bar */}
      <header className="flex items-center gap-3.5 px-6 h-16 bg-white border-b border-[#E4E7ED] flex-none z-10">
        <Link href="/assinador/painel" className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm text-[#5F6675] hover:bg-[#F7F8FA] hover:text-[#1A1D24] transition-colors">
          <ArrowLeft size={15} /> Voltar
        </Link>
        <div className="w-px h-5 bg-[#E4E7ED]" />
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-[#FFF6E5] flex items-center justify-center flex-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C77800" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-[#1A1D24] truncate">{doc.titulo}</div>
            <div className="text-[10px] font-mono text-[#8A91A0]">SHA-256: {doc.documento_hash?.slice(0, 12)}…{doc.documento_hash?.slice(-4)}</div>
          </div>
        </div>
        <StatusChip status={doc.status} size="sm" />
        {doc.arquivo_original_url && (
          <a
            href={pdfUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 h-8 px-3 bg-white border border-[#D6DAE1] rounded-lg text-xs font-semibold text-[#424957] hover:bg-[#F7F8FA] transition-colors flex-none"
          >
            <Download size={13} /> Baixar original
          </a>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* PDF viewer */}
        <main className="flex-1 bg-[#1A1D24] flex flex-col min-w-0">
          <div className="flex items-center gap-3 px-4 h-11 bg-[#1A1D24] border-b border-[#2C313C] text-white/70 text-sm flex-none">
            <span className="font-mono text-xs">{signedCount}/{doc.signatarios.length} assinaram</span>
            <div className="flex-1" />
            <span className="text-xs text-white/50">Página 1 de ?</span>
          </div>
          <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="bg-white shadow-2xl"
                style={{ width: '720px', height: '1018px', border: 'none' }}
                title={doc.titulo}
              />
            ) : (
              <div className="w-[720px] h-[400px] bg-white rounded flex items-center justify-center text-[#8A91A0]">
                PDF não disponível
              </div>
            )}
          </div>
        </main>

        {/* Right panel */}
        <aside className="w-[420px] flex-none flex flex-col bg-white border-l border-[#E4E7ED]">
          {/* Tabs */}
          <nav className="flex border-b border-[#E4E7ED] bg-[#F7F8FA]">
            {([
              { key: 'sign', label: 'Assinar', icon: <PenLine size={14}/> },
              { key: 'signers', label: 'Signatários', icon: <Users size={14}/> },
              { key: 'integrity', label: 'Integridade', icon: <ShieldCheck size={14}/> },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                  tab === t.key
                    ? 'bg-white text-[#0E3F8C] border-[#1351B4]'
                    : 'text-[#8A91A0] border-transparent hover:text-[#1A1D24]'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-5">
            {/* Sign tab */}
            {tab === 'sign' && (
              <>
                {phase === 'done' ? (
                  <div className="flex flex-col items-center text-center">
                    <div className="mt-6">
                      <SuccessBurst variant="check" />
                    </div>
                    <h3 className="text-xl font-bold mt-5 text-[#1A1D24] tracking-tight">Documento assinado!</h3>
                    <p className="text-sm text-[#8A91A0] mt-2 leading-relaxed">
                      Sua assinatura foi registrada com sucesso e o comprovante foi enviado para seu e-mail.
                    </p>
                    <Link
                      href="/assinador/painel"
                      className="mt-6 flex items-center gap-2 h-10 px-5 bg-[#1351B4] text-white text-sm font-semibold rounded-xl hover:bg-[#0E3F8C] transition-colors"
                    >
                      Voltar ao painel
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Callout */}
                    <div className="relative p-4 pl-8 bg-gradient-to-br from-[#EEF4FF] to-white border border-[#DDE9FF] rounded-xl">
                      <span className="absolute left-3.5 top-5 w-2 h-2 bg-[#1F5EDC] rounded-full animate-pulse" />
                      <div className="text-[11px] font-bold text-[#1351B4] uppercase tracking-wider">Sua vez de assinar</div>
                      <h3 className="font-bold text-lg text-[#1A1D24] mt-1 tracking-tight">
                        Olá, {mySig?.nome?.split(' ')[0] || user?.nome?.split(' ')[0] || 'você'}!
                      </h3>
                      <p className="text-sm text-[#5F6675] mt-1.5 leading-relaxed">
                        Você foi convidado a assinar este documento. Leia com atenção antes de continuar.
                      </p>
                    </div>

                    {/* Summary */}
                    <div className="bg-[#F7F8FA] rounded-xl divide-y divide-[#EFF1F4]">
                      {[
                        ['Documento', doc.titulo],
                        ['Em', new Date(doc.created_at).toLocaleDateString('pt-BR')],
                        ['Páginas', '—'],
                        ['Signatários', `${doc.signatarios.length} pessoas`],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between items-center px-3 py-2.5 text-sm">
                          <span className="text-[#8A91A0]">{label}</span>
                          <span className="text-[#1A1D24] font-medium text-right truncate max-w-[180px]">{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Signature pad */}
                    <SignaturePad ref={sigPadRef} />

                    {/* Checkbox */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        reviewed
                          ? 'bg-[#E8F7EE] border-[#1F8A4F]'
                          : 'bg-[#F7F8FA] border-[#E4E7ED]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={e => setReviewed(e.target.checked)}
                        className="mt-0.5 accent-[#1351B4] w-4 h-4 flex-none"
                      />
                      <span className="text-sm text-[#2C313C] leading-relaxed">
                        <strong>Li o documento</strong> e concordo com seu conteúdo. Confirmo que sou <strong>{mySig?.nome || user?.nome}</strong>.
                      </span>
                    </label>

                    {/* Buttons */}
                    <div className="flex flex-col gap-2">
                      <button
                        disabled={!reviewed}
                        onClick={handleAssinar}
                        className="flex items-center justify-center gap-2 h-12 w-full bg-[#1351B4] hover:bg-[#0E3F8C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                      >
                        <PenLine size={16} /> Assinar documento
                      </button>
                      <button className="h-10 w-full bg-white border border-[#D6DAE1] text-[#424957] font-semibold rounded-xl hover:bg-[#F7F8FA] transition-colors text-sm">
                        Recusar assinatura
                      </button>
                    </div>

                    {/* Legal tip */}
                    <div className="flex gap-2.5 p-3 bg-[#F7F8FA] rounded-xl text-xs text-[#5F6675]">
                      <Lock size={13} className="text-[#1F5EDC] flex-none mt-0.5" />
                      <div>
                        <strong className="text-[#1A1D24] block mb-0.5">Assinatura eletrônica avançada</strong>
                        Assinatura manuscrita + código de verificação, vinculada à sua conta. Validade jurídica pela Lei nº 14.063/2020.
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Signers tab */}
            {tab === 'signers' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-[#424957]">{doc.signatarios.length} signatário{doc.signatarios.length !== 1 ? 's' : ''}</span>
                </div>
                {doc.signatarios.map((s, i) => (
                  <TimelineRow
                    key={s.id}
                    signatario={s}
                    ordem={i + 1}
                    isLast={i === doc.signatarios.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Integrity tab */}
            {tab === 'integrity' && (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3 p-3 bg-[#E8F7EE] border border-[#7DD4A8] rounded-xl">
                  <div className="w-10 h-10 bg-[#1F8A4F] rounded-xl flex items-center justify-center flex-none">
                    <ShieldCheck size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#0E6A3A]">Documento íntegro</div>
                    <div className="text-xs text-[#424957]">SHA-256 confere com o lacre original.</div>
                  </div>
                </div>
                <HashBlock hash={doc.documento_hash || ''} />
                <div>
                  <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider mb-2">QR de verificação</div>
                  <div className="bg-[#F7F8FA] rounded-xl p-3 text-xs text-[#8A91A0]">
                    Disponível após todas as assinaturas.
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* OTP Modal */}
      {phase === 'otp' && mySig && (
        <OtpModal
          canal={canal}
          userEmail={mySig.email || user?.email}
          onCancel={() => setPhase('review')}
          onConfirm={assinarComCodigo}
        />
      )}
    </div>
  );
}
