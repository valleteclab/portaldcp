'use client';
import { Search, Bell, ChevronDown, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAssinador } from './AssinadorContext';
import { logoutAssinador } from '@/lib/assinador-api';

function getInitials(name: string) {
  return name?.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
}

function colorFromName(name: string): [string, string] {
  const palette: [string, string][] = [
    ['#DDE9FF', '#0E3F8C'], ['#E8F7EE', '#0E6A3A'], ['#FFF6E5', '#8A5400'],
    ['#FDECEC', '#8E1F1F'], ['#EFE6FA', '#5A2BBE'], ['#E6F2FA', '#137FB8'],
  ];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function AssinadorTopbar() {
  const { user, kpis } = useAssinador();
  const [showDropdown, setShowDropdown] = useState(false);

  const userName = user?.nome || user?.name || 'Usuário';
  const userRole = user?.role || user?.cargo || '';
  const [bg, fg] = colorFromName(userName);

  return (
    <header className="h-16 flex items-center gap-4 px-6 bg-white border-b border-[#E4E7ED] sticky top-0 z-40">
      {/* Search */}
      <div className="relative flex-[0_1_480px]">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A91A0] pointer-events-none" />
        <input
          className="w-full h-9 pl-9 pr-14 bg-[#F7F8FA] border border-[#E4E7ED] rounded-lg text-sm outline-none focus:bg-white focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF] placeholder:text-[#8A91A0] transition-all"
          placeholder="Buscar documentos, signatários..."
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono bg-white border border-[#D6DAE1] border-b-2 text-[#8A91A0] px-1.5 py-0.5 rounded">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Bell */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#F7F8FA] text-[#5F6675]">
          <Bell size={18} />
          {kpis.sua_vez > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#C53030] rounded-full border-2 border-white" />
          )}
        </button>

        {/* User chip */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(d => !d)}
            className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full hover:bg-[#F7F8FA] transition-colors"
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-none"
              style={{ background: bg, color: fg }}
            >
              {getInitials(userName)}
            </span>
            <div className="text-left">
              <div className="text-sm font-semibold text-[#1A1D24] leading-tight">{userName}</div>
              {userRole && <div className="text-[11px] text-[#8A91A0]">{userRole}</div>}
            </div>
            <ChevronDown size={14} className="text-[#8A91A0]" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#E4E7ED] rounded-xl shadow-lg py-1 min-w-[180px] z-50">
              <button
                onClick={logoutAssinador}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-[#C53030] hover:bg-[#FDECEC] transition-colors"
              >
                <LogOut size={15} />
                Sair do Assinador
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
