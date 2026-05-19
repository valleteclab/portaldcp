export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div>
      <div className="h-1.5 bg-[#EFF1F4] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#1F5EDC] to-[#1351B4] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[11px] text-[#8A91A0] mt-1">{current} de {total}</div>
    </div>
  );
}
