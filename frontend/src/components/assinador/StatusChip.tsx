interface StatusChipProps {
  status: 'AGUARDANDO_ASSINATURAS' | 'CONCLUIDO' | 'CANCELADO' | 'RASCUNHO' | string;
  size?: 'sm' | 'md';
}

const STATUS_MAP: Record<string, { label: string; bg: string; dot: string; text: string }> = {
  AGUARDANDO_ASSINATURAS: { label: 'Aguardando', bg: '#FFF6E5', dot: '#C77800', text: '#8A5400' },
  CONCLUIDO: { label: 'Concluído', bg: '#E8F7EE', dot: '#1F8A4F', text: '#0E6A3A' },
  CANCELADO: { label: 'Cancelado', bg: '#EFF1F4', dot: '#8A91A0', text: '#5F6675' },
  RASCUNHO: { label: 'Rascunho', bg: '#EFF1F4', dot: '#8A91A0', text: '#5F6675' },
};

export function StatusChip({ status, size = 'md' }: StatusChipProps) {
  const s = STATUS_MAP[status] || STATUS_MAP.RASCUNHO;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}
