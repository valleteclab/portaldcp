'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Lock } from 'lucide-react';

interface OtpModalProps {
  onCancel: () => void;
  onConfirm: (code: string) => Promise<void>;
  canal?: 'whatsapp' | 'email' | string;
  userEmail?: string;
  sending?: boolean;
}

export function OtpModal({ onCancel, onConfirm, canal, userEmail, sending = false }: OtpModalProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(sending);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [seconds, setSeconds] = useState(45);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (loading) return;
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function setDigit(i: number, val: string) {
    val = val.replace(/\D/g, '').slice(-1);
    const arr = [...digits];
    arr[i] = val;
    setDigits(arr);
    setError('');
    if (val && i < 5) inputs.current[i + 1]?.focus();
    if (arr.every(d => d)) handleSubmit(arr.join(''));
  }

  function handleKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const txt = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!txt) return;
    e.preventDefault();
    const arr = txt.split('').concat(Array(6 - txt.length).fill(''));
    setDigits(arr);
    if (arr.every(d => d)) handleSubmit(txt);
  }

  async function handleSubmit(code: string) {
    setLoading(true);
    try {
      await onConfirm(code);
    } catch (err: any) {
      setError(err.message || 'Código incorreto. Tente novamente.');
      setShake(true);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => { setShake(false); inputs.current[0]?.focus(); }, 500);
    } finally {
      setLoading(false);
    }
  }

  const maskedContact = canal === 'whatsapp' ? '(77) 9•••• 1234' : (userEmail?.replace(/(.{2}).*@/, '$1•••@') || 'seu e-mail');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-8 w-[460px] max-w-[95vw] relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onCancel} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#EFF1F4] text-[#8A91A0]">
          <X size={16} />
        </button>

        {/* Icon */}
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-lg mb-4" style={{ background: canal === 'whatsapp' ? '#25D366' : '#1351B4' }}>
          {canal === 'whatsapp' ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          )}
        </div>

        <h3 className="text-xl font-bold text-center text-[#1A1D24] tracking-tight mb-1.5">
          Confirmação por {canal === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
        </h3>
        <p className="text-sm text-[#5F6675] text-center leading-relaxed mb-6">
          {loading ? 'Enviando código...' : <>Enviamos um código de 6 dígitos para <strong className="text-[#1A1D24]">{maskedContact}</strong></>}
        </p>

        {/* OTP inputs */}
        <div className={`flex gap-2 justify-center mb-4 ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el; }}
              value={d}
              maxLength={1}
              inputMode="numeric"
              autoFocus={i === 0 && !loading}
              disabled={loading}
              onChange={e => setDigit(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
              onPaste={handlePaste}
              className={`w-11 h-14 text-center text-2xl font-bold border-2 rounded-xl font-mono text-[#1A1D24] outline-none transition-all disabled:opacity-40 ${
                error ? 'border-[#C53030]' : 'border-[#E4E7ED] focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF]'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="text-[#C53030] text-sm text-center mb-4">⚠ {error}</div>
        )}

        <div className="text-center mb-5">
          {seconds > 0 ? (
            <span className="text-sm text-[#8A91A0]">Reenviar código em <strong>{seconds}s</strong></span>
          ) : (
            <button className="text-sm text-[#1351B4] font-semibold hover:underline">↺ Reenviar código</button>
          )}
        </div>

        <div className="pt-4 border-t border-[#EFF1F4] flex justify-between items-center">
          <button onClick={onCancel} className="text-sm text-[#5F6675] hover:text-[#1A1D24] font-medium">Cancelar</button>
          <div className="flex items-center gap-1.5 text-[11px] text-[#8A91A0]">
            <Lock size={12} /> Protegido por criptografia
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%,60%{transform:translateX(-6px)}
          40%,80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
}
