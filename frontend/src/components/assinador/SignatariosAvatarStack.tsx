interface Signatario { nome: string; status: string; }

function colorFromName(name: string): [string, string] {
  const palette: [string, string][] = [
    ['#DDE9FF', '#0E3F8C'], ['#E8F7EE', '#0E6A3A'], ['#FFF6E5', '#8A5400'],
    ['#FDECEC', '#8E1F1F'], ['#EFE6FA', '#5A2BBE'], ['#E6F2FA', '#137FB8'],
  ];
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function getInitials(name: string) {
  return name?.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
}

export function SignatariosAvatarStack({ signatarios, max = 4 }: { signatarios: Signatario[]; max?: number }) {
  const shown = signatarios.slice(0, max);
  const overflow = signatarios.length - shown.length;

  return (
    <div className="flex">
      {shown.map((s, i) => {
        const [bg, fg] = colorFromName(s.nome);
        const signed = s.status === 'ASSINADO';
        return (
          <div key={i} className="relative" style={{ marginLeft: i === 0 ? 0 : -8, zIndex: max - i }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white"
              style={{ background: bg, color: fg }}
              title={`${s.nome}${signed ? ' · assinou' : ''}`}
            >
              {getInitials(s.nome)}
            </div>
            {signed && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#1F8A4F] rounded-full border border-white flex items-center justify-center">
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-[#EFF1F4] text-[#5F6675] border-2 border-white"
          style={{ marginLeft: -8 }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
