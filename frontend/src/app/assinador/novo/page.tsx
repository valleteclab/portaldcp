'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, Info, ShieldCheck, Plus, Trash2, Search, Check, Users, Building2, Briefcase, Globe, ChevronDown, Loader2 } from 'lucide-react';
import { assinadorFetch, assinadorGet } from '@/lib/assinador-api';
import { API_URL } from '@/lib/api';

// ---- Stepper ----
function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center bg-white border border-[#E4E7ED] rounded-2xl px-5 py-3.5 shadow-sm">
      {steps.map((s, i) => {
        const num = i + 1;
        const state = num < current ? 'done' : num === current ? 'now' : 'todo';
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none gap-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-none transition-all ${
              state === 'done' ? 'bg-[#1F8A4F] text-white' :
              state === 'now' ? 'bg-[#1351B4] text-white ring-4 ring-[#DDE9FF]' :
              'bg-[#EFF1F4] text-[#8A91A0]'
            }`}>
              {state === 'done' ? <Check size={13} strokeWidth={3}/> : num}
            </div>
            <span className={`text-sm font-semibold whitespace-nowrap ${
              state === 'now' ? 'text-[#1A1D24]' : state === 'done' ? 'text-[#424957]' : 'text-[#8A91A0]'
            }`}>{s}</span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 rounded-full min-w-[20px] ${state === 'done' ? 'bg-[#1F8A4F]' : 'bg-[#E4E7ED]'}`}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Step 1: Upload ----
function StepUpload({ onNext }: { onNext: (file: File) => void }) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file || file.type !== 'application/pdf') return;
    onNext(file);
  }

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 320px' }}>
      <div className="bg-white border border-[#E4E7ED] rounded-2xl p-8">
        <div
          className={`border-2 border-dashed rounded-2xl py-14 px-8 text-center cursor-pointer transition-all ${hover ? 'border-[#1F5EDC] bg-[#EEF4FF]' : 'border-[#D6DAE1] bg-[#F7F8FA] hover:border-[#1F5EDC] hover:bg-[#EEF4FF]'}`}
          onDragOver={e => { e.preventDefault(); setHover(true); }}
          onDragLeave={() => setHover(false)}
          onDrop={e => { e.preventDefault(); setHover(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
        >
          <div className="w-16 h-16 mx-auto bg-[#DDE9FF] rounded-2xl flex items-center justify-center mb-4">
            <Upload size={28} className="text-[#1351B4]" />
          </div>
          <h3 className="text-xl font-bold text-[#1A1D24] mb-1">Arraste seu PDF aqui</h3>
          <p className="text-sm text-[#8A91A0]">ou clique para escolher do computador</p>
          <div className="flex items-center justify-center gap-4 mt-5 text-xs text-[#B8BDC7]">
            <span>· PDF até 25 MB</span>
            <span>· Máx. 100 páginas</span>
            <span>· Lacrado após o envio</span>
          </div>
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        </div>
        <div className="mt-5 p-4 bg-[#E6F2FA] rounded-xl flex gap-3">
          <Info size={16} className="text-[#137FB8] flex-none mt-0.5" />
          <div className="text-sm text-[#2C313C]">
            <strong>Primeiro documento?</strong> Após o envio, o PDF é selado com um hash SHA-256.
            Qualquer alteração no arquivo invalida todas as assinaturas.
          </div>
        </div>
      </div>

      <aside className="bg-white border border-[#E4E7ED] rounded-2xl p-5 h-fit">
        <div className="text-[10px] font-bold text-[#1351B4] uppercase tracking-widest mb-3">Como funciona</div>
        <ol className="space-y-3 text-sm text-[#5F6675] leading-relaxed">
          <li><strong className="text-[#1A1D24]">1. Envie o PDF.</strong> O arquivo é lacrado.</li>
          <li><strong className="text-[#1A1D24]">2. Adicione signatários.</strong> Você, colegas, fornecedores ou externos.</li>
          <li><strong className="text-[#1A1D24]">3. Clique no PDF</strong> para posicionar onde cada um assina.</li>
          <li><strong className="text-[#1A1D24]">4. Envie.</strong> Cada signatário recebe link único e código por WhatsApp.</li>
        </ol>
        <div className="mt-4 p-3 bg-[#E8F7EE] rounded-xl flex gap-2 text-xs text-[#0E6A3A]">
          <ShieldCheck size={13} className="text-[#1F8A4F] flex-none mt-0.5" />
          Documentos protegidos com chave criptográfica e validade jurídica.
        </div>
      </aside>
    </div>
  );
}

// ---- Step 2: Signers ----
interface Signer { id: string; name: string; email: string; cpfCnpj?: string; phone?: string; type: 'me' | 'interno' | 'fornecedor' | 'externo'; }

function StepSigners({
  signers, setSigners, order, setOrder, onNext, onBack
}: {
  signers: Signer[]; setSigners: React.Dispatch<React.SetStateAction<Signer[]>>;
  order: 'free' | 'sequential'; setOrder: (o: 'free' | 'sequential') => void;
  onNext: () => void; onBack: () => void;
}) {
  const [picker, setPicker] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [externalForm, setExternalForm] = useState({ name: '', email: '', phone: '' });

  async function buscarInternos(q: string) {
    setSearchQ(q);
    if (!q) { setSearchResults([]); return; }
    try {
      const data = await assinadorGet<any[]>(`/api/assinador/usuarios?q=${encodeURIComponent(q)}`);
      setSearchResults(data);
    } catch { setSearchResults([]); }
  }

  async function buscarFornecedores(q: string) {
    setSearchQ(q);
    if (!q) { setSearchResults([]); return; }
    try {
      const data = await assinadorGet<any[]>(`/api/fornecedores?q=${encodeURIComponent(q)}`);
      setSearchResults(Array.isArray(data) ? data.slice(0, 10) : []);
    } catch { setSearchResults([]); }
  }

  function addSigner(s: Signer) {
    if (signers.find(x => x.email === s.email)) return;
    setSigners(prev => [...prev, { ...s, id: 'sig-' + Date.now() + Math.random() }]);
    setPicker(null);
    setSearchResults([]);
    setSearchQ('');
  }

  function removeSigner(id: string) {
    setSigners(prev => prev.filter(s => s.id !== id));
  }

  const CATS = [
    { key: 'me', icon: <Users size={18}/>, label: 'Eu mesmo', sub: 'Adicionar você como signatário', tone: 'info' },
    { key: 'interno', icon: <Building2 size={18}/>, label: 'Interno', sub: 'Colegas da Câmara', tone: 'brand' },
    { key: 'fornecedor', icon: <Briefcase size={18}/>, label: 'Fornecedor', sub: 'Empresa cadastrada', tone: 'warn' },
    { key: 'externo', icon: <Globe size={18}/>, label: 'Externo', sub: 'Convidar por e-mail', tone: 'neutral' },
  ] as const;

  const catColors: Record<string, string> = {
    info: '#137FB8', brand: '#1351B4', warn: '#C77800', neutral: '#5F6675'
  };
  const catBg: Record<string, string> = {
    info: '#E6F2FA', brand: '#EEF4FF', warn: '#FFF6E5', neutral: '#EFF1F4'
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
      <div className="bg-white border border-[#E4E7ED] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-[#1A1D24] mb-1">Quem precisa assinar?</h2>
        <p className="text-sm text-[#8A91A0] mb-5">Adicione os signatários por categoria. Você pode misturar quantos quiser.</p>

        {/* Category buttons */}
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          {CATS.map(cat => {
            const already = cat.key === 'me' && signers.some(s => s.type === 'me');
            return (
              <button
                key={cat.key}
                disabled={already}
                onClick={() => {
                  if (cat.key === 'me') {
                    // Would auto-add current user — for now just set picker
                    setPicker(picker === 'me' ? null : 'me');
                  } else {
                    setPicker(picker === cat.key ? null : cat.key);
                    setSearchResults([]); setSearchQ('');
                  }
                }}
                className={`flex flex-col items-start gap-2 p-3 rounded-xl border-[1.5px] transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  picker === cat.key
                    ? 'border-[#1F5EDC] bg-[#EEF4FF] shadow-[0_0_0_3px_#DDE9FF]'
                    : 'border-[#E4E7ED] bg-white hover:border-[#1F5EDC] hover:bg-[#EEF4FF]'
                }`}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: catBg[cat.tone], color: catColors[cat.tone] }}>
                  {cat.icon}
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm text-[#1A1D24]">{cat.label}</div>
                  <div className="text-[11px] text-[#8A91A0] mt-0.5">{cat.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Picker panels */}
        {picker === 'me' && (
          <div className="border border-[#DDE9FF] bg-[#EEF4FF] rounded-xl overflow-hidden mb-3">
            <div className="px-4 py-3 bg-white border-b border-[#E4E7ED] font-bold text-sm">Eu mesmo</div>
            <div className="p-4">
              <p className="text-sm text-[#5F6675] mb-3">Clique para se adicionar como signatário usando suas credenciais de login.</p>
              <button
                onClick={() => addSigner({ id: '', name: 'Eu mesmo', email: 'me@myself', type: 'me' })}
                className="h-9 px-4 bg-[#1351B4] text-white text-sm font-semibold rounded-xl hover:bg-[#0E3F8C] transition-colors"
              >
                + Adicionar eu mesmo
              </button>
            </div>
          </div>
        )}

        {(picker === 'interno' || picker === 'fornecedor') && (
          <div className="border border-[#DDE9FF] bg-[#EEF4FF] rounded-xl overflow-hidden mb-3">
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#E4E7ED]">
              <span className="font-bold text-sm">{picker === 'interno' ? 'Colegas da Câmara' : 'Fornecedores cadastrados'}</span>
              <div className="flex items-center gap-2 bg-[#F7F8FA] border border-[#E4E7ED] rounded-lg px-2.5 w-72">
                <Search size={13} className="text-[#8A91A0]" />
                <input
                  className="bg-transparent outline-none text-sm h-8 flex-1 placeholder:text-[#B8BDC7]"
                  placeholder="Buscar por nome ou e-mail..."
                  value={searchQ}
                  onChange={e => picker === 'interno' ? buscarInternos(e.target.value) : buscarFornecedores(e.target.value)}
                />
              </div>
            </div>
            <div className="bg-white max-h-[240px] overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#8A91A0]">
                  {searchQ ? 'Nenhum resultado encontrado.' : 'Digite para buscar...'}
                </div>
              ) : searchResults.map((r: any) => {
                const already = signers.some(s => s.email === (r.email || r.representante_email));
                const email = r.email || r.representante_email || '';
                const name = r.nome || r.razao_social || '';
                return (
                  <button
                    key={r.id}
                    disabled={already}
                    onClick={() => addSigner({ id: '', name, email, cpfCnpj: r.cpf || r.cpf_cnpj, type: picker as 'interno' | 'fornecedor' })}
                    className="flex items-center gap-3 w-full px-4 py-2.5 border-b border-[#EFF1F4] last:border-none hover:bg-[#EEF4FF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#DDE9FF] flex items-center justify-center text-[11px] font-bold text-[#0E3F8C] flex-none">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-semibold text-sm text-[#1A1D24] truncate">{name}</div>
                      <div className="text-xs text-[#8A91A0] truncate">{email}</div>
                    </div>
                    {already
                      ? <span className="text-[11px] font-semibold text-[#1F8A4F]">Adicionado</span>
                      : <span className="text-[13px] font-semibold text-[#1351B4]">+ Adicionar</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {picker === 'externo' && (
          <div className="border border-[#DDE9FF] bg-[#EEF4FF] rounded-xl overflow-hidden mb-3">
            <div className="px-4 py-3 bg-white border-b border-[#E4E7ED] font-bold text-sm">Convidar pessoa externa</div>
            <div className="p-4 grid grid-cols-2 gap-3 bg-white">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#424957]">Nome completo *</span>
                <input className="h-10 px-3 border border-[#D6DAE1] rounded-xl text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF]" placeholder="Maria da Silva" value={externalForm.name} onChange={e => setExternalForm(f => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#424957]">E-mail *</span>
                <input type="email" className="h-10 px-3 border border-[#D6DAE1] rounded-xl text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF]" placeholder="nome@dominio.com" value={externalForm.email} onChange={e => setExternalForm(f => ({ ...f, email: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[#424957]">WhatsApp (para OTP)</span>
                <input className="h-10 px-3 border border-[#D6DAE1] rounded-xl text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF]" placeholder="(77) 9 9999-9999" value={externalForm.phone} onChange={e => setExternalForm(f => ({ ...f, phone: e.target.value }))} />
              </label>
              <div className="flex items-end">
                <button
                  disabled={!externalForm.name || !externalForm.email}
                  onClick={() => {
                    addSigner({ id: '', name: externalForm.name, email: externalForm.email, phone: externalForm.phone, type: 'externo' });
                    setExternalForm({ name: '', email: '', phone: '' });
                  }}
                  className="h-10 px-4 bg-[#1351B4] text-white text-sm font-semibold rounded-xl hover:bg-[#0E3F8C] disabled:opacity-40 transition-colors w-full"
                >
                  + Adicionar à lista
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Signer list */}
        {signers.length === 0 ? (
          <div className="mt-4 py-10 text-center border-2 border-dashed border-[#E4E7ED] rounded-xl text-sm text-[#B8BDC7]">
            Nenhum signatário ainda. Escolha uma categoria acima.
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-[#424957]">{signers.length} signatário{signers.length !== 1 ? 's' : ''}</span>
              <div className="flex bg-[#EFF1F4] rounded-xl p-0.5">
                {(['free', 'sequential'] as const).map(v => (
                  <button key={v} onClick={() => setOrder(v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${order === v ? 'bg-white text-[#1A1D24] shadow-sm' : 'text-[#5F6675]'}`}>
                    {v === 'free' ? <><Users size={12}/> Ordem livre</> : <><ArrowRight size={12}/> Sequencial</>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {signers.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-white border border-[#E4E7ED] rounded-xl">
                  <div className="w-9 h-9 rounded-full bg-[#DDE9FF] flex items-center justify-center text-xs font-bold text-[#0E3F8C] flex-none">
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[#1A1D24] truncate">{s.name}</div>
                    <div className="text-xs text-[#8A91A0] truncate">{s.type === 'me' ? 'Eu mesmo' : s.type === 'interno' ? 'Interno' : s.type === 'fornecedor' ? 'Fornecedor' : 'Externo'} · {s.email}</div>
                  </div>
                  <button onClick={() => removeSigner(s.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#FDECEC] text-[#8A91A0] hover:text-[#C53030] transition-colors">
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="bg-white border border-[#E4E7ED] rounded-2xl p-5 h-fit">
        <div className="text-[10px] font-bold text-[#1351B4] uppercase tracking-widest mb-3">Categoria do signatário</div>
        <div className="flex flex-col gap-3">
          {[
            { icon: <Users size={14}/>, bg: '#E6F2FA', color: '#137FB8', label: 'Eu mesmo', desc: 'Aparece direto no seu painel' },
            { icon: <Building2 size={14}/>, bg: '#EEF4FF', color: '#1351B4', label: 'Interno', desc: 'Assina pelo portal · OTP por e-mail' },
            { icon: <Briefcase size={14}/>, bg: '#FFF6E5', color: '#C77800', label: 'Fornecedor', desc: 'Recebe link por e-mail · OTP por WhatsApp' },
            { icon: <Globe size={14}/>, bg: '#EFF1F4', color: '#5F6675', label: 'Externo', desc: 'Convida qualquer pessoa por e-mail' },
          ].map(c => (
            <div key={c.label} className="flex gap-2.5 items-start">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-none" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
              <div>
                <div className="font-bold text-sm text-[#1A1D24]">{c.label}</div>
                <div className="text-[11px] text-[#8A91A0] mt-0.5">{c.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3.5 bg-[#EEF4FF] rounded-xl text-xs text-[#0E3F8C]">
          <strong>Ordem livre vs. sequencial?</strong>
          <p className="mt-1.5 leading-relaxed text-[#424957]">
            <strong>Livre</strong>: todos recebem ao mesmo tempo.<br/>
            <strong>Sequencial</strong>: cada um só é notificado após o anterior.
          </p>
        </div>
      </aside>

      <div className="flex justify-between items-center pt-4 border-t border-[#EFF1F4] col-span-2">
        <button onClick={onBack} className="flex items-center gap-2 h-10 px-4 text-sm font-semibold text-[#5F6675] hover:text-[#1A1D24] transition-colors">
          <ArrowLeft size={15}/> Voltar
        </button>
        <button
          onClick={onNext}
          disabled={signers.length === 0}
          className="flex items-center gap-2 h-12 px-6 bg-[#1351B4] hover:bg-[#0E3F8C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors"
        >
          Continuar para posicionar carimbos <ArrowRight size={15}/>
        </button>
      </div>
    </div>
  );
}

// ---- Step 3: Place stamps ----
function StepPlace({ file, signers, markers, setMarkers, onNext, onBack }: {
  file: File; signers: Signer[]; markers: any[]; setMarkers: React.Dispatch<React.SetStateAction<any[]>>;
  onNext: () => void; onBack: () => void;
}) {
  const [activeSigner, setActiveSigner] = useState(signers[0]?.id || null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const fileUrl = file ? URL.createObjectURL(file) : null;

  const COLORS = ['#1F5EDC', '#C77800', '#1F8A4F', '#8E1F1F', '#5A2BBE', '#137FB8'];

  function placeMarker(e: React.MouseEvent) {
    if (!activeSigner || !pdfRef.current) return;
    const rect = pdfRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const sigIdx = signers.findIndex(s => s.id === activeSigner);
    const signer = signers[sigIdx];
    setMarkers(prev => [...prev, {
      id: 'mk-' + Date.now(),
      signerId: activeSigner,
      signerName: signer.name,
      x: x / rect.width,
      y: y / rect.height,
      color: COLORS[sigIdx % COLORS.length],
      order: sigIdx + 1,
    }]);
  }

  function removeMarker(id: string) {
    setMarkers(prev => prev.filter(m => m.id !== id));
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-64px-56px-180px)] min-h-[500px]">
      {/* Left panel */}
      <aside className="w-72 flex-none bg-white border border-[#E4E7ED] rounded-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[#E4E7ED]">
          <div className="font-bold text-sm text-[#1A1D24]">Posicionar carimbos</div>
          <div className="text-xs text-[#8A91A0] mt-1 leading-relaxed">
            Selecione um signatário e <strong>clique no PDF</strong> onde a assinatura aparece.
          </div>
        </div>
        <div className="p-4 border-b border-[#E4E7ED]">
          <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider mb-2">Signatários</div>
          <div className="flex flex-col gap-1.5">
            {signers.map((s, i) => {
              const count = markers.filter(m => m.signerId === s.id).length;
              const color = COLORS[i % COLORS.length];
              const active = s.id === activeSigner;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSigner(s.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border-[1.5px] text-left transition-all ${active ? 'border-current shadow-[0_0_0_3px_currentColor]/20' : 'border-[#E4E7ED] hover:border-[#D6DAE1]'}`}
                  style={active ? { borderColor: color, boxShadow: `0 0 0 3px ${color}20` } : {}}
                >
                  <span className="w-3 h-3 rounded-full flex-none" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-[#1A1D24] truncate">{s.name}</div>
                    <div className={`text-[10px] ${count > 0 ? 'text-[#1F8A4F]' : 'text-[#8A91A0]'}`}>{count > 0 ? `${count} carimbo${count > 1 ? 's' : ''}` : 'Sem carimbo'}</div>
                  </div>
                  {count > 0 && <Check size={12} className="text-[#1F8A4F] flex-none" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-4 text-xs text-[#8A91A0] leading-relaxed">
          <Info size={12} className="inline mr-1 text-[#137FB8]" />
          Pode adicionar mais de um carimbo por signatário. Se pular, o sistema posiciona automaticamente no rodapé.
        </div>
        <div className="flex-1" />
        <div className="p-4 border-t border-[#E4E7ED] flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1.5 h-9 px-3 text-sm text-[#5F6675] hover:text-[#1A1D24]"><ArrowLeft size={14}/> Voltar</button>
          <button onClick={onNext} className="flex items-center gap-1.5 h-9 px-4 bg-[#1351B4] hover:bg-[#0E3F8C] text-white text-sm font-semibold rounded-xl transition-colors">
            Continuar <ArrowRight size={14}/>
          </button>
        </div>
      </aside>

      {/* PDF area */}
      <main className="flex-1 bg-[#D6DAE1] border border-[#E4E7ED] rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-4 h-11 bg-white border-b border-[#E4E7ED]">
          <span className="text-sm font-semibold text-[#1A1D24] truncate flex-1">{file.name}</span>
          {activeSigner && (
            <span className="text-xs bg-[#EEF4FF] text-[#1351B4] px-2.5 py-1 rounded-full font-semibold">
              Clicando posiciona: {signers.find(s => s.id === activeSigner)?.name}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-auto p-8 flex items-start justify-center" style={{ cursor: activeSigner ? 'crosshair' : 'default' }}>
          <div ref={pdfRef} className="relative" onClick={placeMarker}>
            {fileUrl ? (
              <iframe src={fileUrl} className="bg-white shadow-xl" style={{ width: 720, height: 1018, border: 'none' }} title="PDF preview" />
            ) : (
              <div className="w-[720px] h-[400px] bg-white rounded" />
            )}
            {markers.map(m => (
              <div
                key={m.id}
                className="absolute flex flex-col items-center justify-center border-2 border-dashed rounded-lg text-center pointer-events-auto"
                style={{
                  left: m.x * 720 - 80, top: m.y * 1018 - 25,
                  width: 160, height: 50,
                  borderColor: m.color,
                  background: `${m.color}15`,
                }}
                onClick={e => { e.stopPropagation(); removeMarker(m.id); }}
              >
                <div className="text-[9px] font-bold" style={{ color: m.color }}>Assinatura #{m.order}</div>
                <div className="text-[9px] text-[#424957]">{m.signerName}</div>
                <button className="absolute -top-2 -right-2 w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px]" style={{ background: m.color }}>×</button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// ---- Step 4: Review ----
function StepReview({ file, signers, markers, onSend, onBack, sending }: {
  file: File; signers: Signer[]; markers: any[]; onSend: (msg: string) => void; onBack: () => void; sending: boolean;
}) {
  const [msg, setMsg] = useState('');
  const [deadline, setDeadline] = useState('');
  const COLORS = ['#1F5EDC', '#C77800', '#1F8A4F', '#8E1F1F', '#5A2BBE', '#137FB8'];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
      <div className="bg-white border border-[#E4E7ED] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-[#1A1D24] mb-1">Confira antes de enviar</h2>
        <p className="text-sm text-[#8A91A0] mb-5">Depois de enviar, o PDF é lacrado e qualquer alteração invalida as assinaturas.</p>

        {/* Doc */}
        <div className="border-b border-[#EFF1F4] pb-5 mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#EEF4FF] rounded-lg flex items-center justify-center flex-none">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1351B4" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div className="font-bold text-sm text-[#1A1D24]">{file.name}</div>
                <div className="text-xs text-[#8A91A0]">{(file.size / 1024).toFixed(0)} KB</div>
              </div>
            </div>
          </div>
        </div>

        {/* Signers */}
        <div className="border-b border-[#EFF1F4] pb-5 mb-5">
          <div className="font-bold text-sm text-[#1A1D24] mb-3">
            Signatários ({signers.length})
          </div>
          <div className="flex flex-col gap-2">
            {signers.map((s, i) => {
              const count = markers.filter(m => m.signerId === s.id).length;
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-[#F7F8FA] rounded-xl">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-none" style={{ background: COLORS[i % COLORS.length] }}>{i + 1}</div>
                  <div className="w-8 h-8 rounded-full bg-[#DDE9FF] flex items-center justify-center text-[11px] font-bold text-[#0E3F8C] flex-none">{s.name.slice(0, 2).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#1A1D24] truncate">{s.name}</div>
                    <div className="text-xs text-[#8A91A0] truncate">{s.type} · {s.email}</div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${count > 0 ? 'bg-[#E8F7EE] text-[#0E6A3A]' : 'bg-[#FFF6E5] text-[#8A5400]'}`}>
                    {count} carimbo{count !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Message */}
        <div className="border-b border-[#EFF1F4] pb-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-sm text-[#1A1D24]">Mensagem (opcional)</span>
            <span className="text-xs text-[#8A91A0]">Enviada por e-mail aos signatários</span>
          </div>
          <textarea
            className="w-full h-24 px-3 py-2.5 border border-[#D6DAE1] rounded-xl text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF] resize-none placeholder:text-[#B8BDC7]"
            placeholder="Olá! Por gentileza, assinem o documento em anexo..."
            value={msg}
            onChange={e => setMsg(e.target.value)}
          />
        </div>

        {/* Advanced */}
        <div>
          <div className="font-bold text-sm text-[#1A1D24] mb-3">Opções avançadas</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#424957]">Prazo para assinatura</span>
              <input type="date" className="h-10 px-3 border border-[#D6DAE1] rounded-xl text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF]" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-[#424957]">Autenticação</span>
              <div className="h-10 px-3 border border-[#D6DAE1] rounded-xl text-sm flex items-center justify-between text-[#424957] bg-[#F7F8FA]">
                OTP por WhatsApp + e-mail <ChevronDown size={14} className="text-[#8A91A0]" />
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm text-[#424957] cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-[#1351B4] w-4 h-4" />
              Enviar lembretes automáticos a cada 2 dias
            </label>
            <label className="flex items-center gap-2 text-sm text-[#424957] cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-[#1351B4] w-4 h-4" />
              Incluir QR code de verificação no PDF final
            </label>
          </div>
        </div>
      </div>

      <aside className="bg-white border border-[#E4E7ED] rounded-2xl p-5 h-fit">
        <div className="text-[10px] font-bold text-[#1351B4] uppercase tracking-widest mb-3">O que acontece agora</div>
        <ol className="space-y-3 text-sm text-[#5F6675] leading-relaxed">
          <li><strong className="text-[#1A1D24]">O PDF é lacrado</strong> com hash SHA-256.</li>
          <li><strong className="text-[#1A1D24]">Cada signatário recebe um link</strong> personalizado por e-mail.</li>
          <li><strong className="text-[#1A1D24]">Código por WhatsApp</strong> confirma a identidade.</li>
          <li><strong className="text-[#1A1D24]">Você recebe uma notificação</strong> a cada assinatura.</li>
        </ol>
        <div className="mt-4 p-3 bg-[#E8F7EE] rounded-xl flex gap-2 text-xs text-[#0E6A3A]">
          <ShieldCheck size={13} className="text-[#1F8A4F] flex-none mt-0.5" />
          Trilha de auditoria completa: data, hora, IP e hash de cada ação.
        </div>
      </aside>

      <div className="flex justify-between items-center pt-4 border-t border-[#EFF1F4] col-span-2">
        <button onClick={onBack} className="flex items-center gap-2 h-10 px-4 text-sm font-semibold text-[#5F6675] hover:text-[#1A1D24]">
          <ArrowLeft size={15}/> Voltar
        </button>
        <button
          onClick={() => onSend(msg)}
          disabled={sending}
          className="flex items-center gap-2 h-12 px-6 bg-[#1351B4] hover:bg-[#0E3F8C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors"
        >
          {sending ? <Loader2 size={16} className="animate-spin"/> : null}
          {sending ? 'Enviando...' : <><ArrowRight size={15}/> Enviar para assinatura</>}
        </button>
      </div>
    </div>
  );
}

// ---- Main ----
export default function NovoPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [order, setOrder] = useState<'free' | 'sequential'>('free');
  const [markers, setMarkers] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  const STEPS = ['Enviar PDF', 'Quem assina', 'Posicionar carimbos', 'Revisar e enviar'];

  async function handleSend(msg: string) {
    if (!file || signers.length === 0) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);

      const dados = {
        titulo: file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
        descricao: msg || undefined,
        signatarios: signers.map((s, i) => ({
          nome: s.name,
          email: s.email,
          telefone: s.phone || '',
          cpf_cnpj: s.cpfCnpj || '',
          is_orgao_user: s.type === 'interno' || s.type === 'me',
          pagina_assinatura: 1,
          pos_x: markers.find(m => m.signerId === s.id)?.x ?? 0.5,
          pos_y: markers.find(m => m.signerId === s.id)?.y ?? 0.85,
        })),
      };
      formData.append('dados', JSON.stringify(dados));

      const res = await assinadorFetch('/api/assinador', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Erro ao criar documento');
      const doc = await res.json();
      router.push(`/assinador/enviado?id=${doc.id}`);
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar documento');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
      {/* Back */}
      <button onClick={() => step === 1 ? router.push('/assinador/painel') : setStep(s => s - 1)}
        className="flex items-center gap-1.5 text-sm text-[#5F6675] hover:text-[#1A1D24] w-fit">
        <ArrowLeft size={15}/> {step === 1 ? 'Voltar ao painel' : 'Etapa anterior'}
      </button>

      <div>
        <h1 className="text-[26px] font-bold text-[#0E1015] tracking-tight">Novo documento para assinatura</h1>
        <p className="text-sm text-[#5F6675] mt-1">Em 4 passos rápidos: envie, configure quem assina, posicione os carimbos e envie.</p>
      </div>

      <Stepper steps={STEPS} current={step} />

      {step === 1 && (
        <StepUpload onNext={f => { setFile(f); setStep(2); }} />
      )}
      {step === 2 && file && (
        <StepSigners signers={signers} setSigners={setSigners} order={order} setOrder={setOrder} onNext={() => setStep(3)} onBack={() => setStep(1)} />
      )}
      {step === 3 && file && (
        <StepPlace file={file} signers={signers} markers={markers} setMarkers={setMarkers} onNext={() => setStep(4)} onBack={() => setStep(2)} />
      )}
      {step === 4 && file && (
        <StepReview file={file} signers={signers} markers={markers} onSend={handleSend} onBack={() => setStep(3)} sending={sending} />
      )}
    </div>
  );
}
