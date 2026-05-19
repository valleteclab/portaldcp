'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function HashBlock({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider mb-1.5">Lacre digital (SHA-256)</div>
      <div className="bg-[#F7F8FA] rounded-lg p-3 font-mono text-[11px] text-[#1A1D24] break-all leading-relaxed">{hash || '—'}</div>
      <button
        onClick={copy}
        className="flex items-center gap-1.5 mt-2 text-xs text-[#5F6675] hover:text-[#1A1D24] transition-colors"
      >
        {copied ? <Check size={13} className="text-[#1F8A4F]" /> : <Copy size={13} />}
        {copied ? 'Copiado!' : 'Copiar hash'}
      </button>
    </div>
  );
}
