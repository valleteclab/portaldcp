interface KpiCardProps {
  variant: 'info' | 'warn' | 'ok';
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  ctaLabel?: string;
  onCta?: () => void;
}

const VARIANT_STYLES = {
  info: { bg: '#EEF4FF', border: '#DDE9FF', icon: '#1F5EDC', num: '#0E3F8C' },
  warn: { bg: '#FFF6E5', border: '#FCC97B', icon: '#C77800', num: '#8A5400' },
  ok: { bg: '#E8F7EE', border: '#7DD4A8', icon: '#1F8A4F', num: '#0E6A3A' },
};

export function KpiCard({ variant, icon, label, value, hint, ctaLabel, onCta }: KpiCardProps) {
  const s = VARIANT_STYLES[variant];
  return (
    <div
      className="flex items-start gap-4 p-5 rounded-xl relative overflow-hidden"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-none" style={{ background: 'rgba(255,255,255,0.6)', color: s.icon }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold tracking-wide uppercase" style={{ color: s.icon }}>{label}</div>
        <div className="text-3xl font-bold leading-tight mt-1 tracking-tight" style={{ color: s.num }}>{value}</div>
        <div className="text-xs mt-1.5 text-[#5F6675]">{hint}</div>
      </div>
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          className="absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-white/50 transition-colors"
          style={{ color: s.icon }}
        >
          {ctaLabel} →
        </button>
      )}
    </div>
  );
}
