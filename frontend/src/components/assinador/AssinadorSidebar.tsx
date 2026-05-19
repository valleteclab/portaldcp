'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Plus, Home, PenLine, Clock, CheckCircle, Fingerprint, History } from 'lucide-react';
import { useAssinador } from './AssinadorContext';

function BrandMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
      <path d="M20 2L4 7v11c0 9 7 16 16 18 9-2 16-9 16-18V7l-16-5z"
        fill="url(#asbg)" stroke="#0E3F8C" strokeWidth="1.5"/>
      <path d="M14 20l4 4 8-8" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="asbg" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0" stopColor="#1F5EDC"/>
          <stop offset="1" stopColor="#0E3F8C"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
}

function NavItem({ href, icon, label, badge, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-[#EEF4FF] text-[#0E3F8C] font-semibold'
          : 'text-[#5F6675] hover:bg-[#F7F8FA] hover:text-[#1A1D24]'
      }`}
    >
      <span className={active ? 'text-[#1F5EDC]' : 'text-[#8A91A0]'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-[#C77800] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function AssinadorSidebar() {
  const pathname = usePathname();
  const { kpis } = useAssinador();

  const is = (p: string) => pathname === p || pathname.startsWith(p + '/');

  return (
    <aside className="w-[260px] flex-none flex flex-col bg-white border-r border-[#E4E7ED] sticky top-0 h-screen overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#EFF1F4] mb-4">
        <BrandMark />
        <div>
          <div className="font-extrabold text-[15px] text-[#1A1D24] leading-tight tracking-tight">Assinador</div>
          <div className="text-[11px] text-[#8A91A0] mt-0.5">Câmara Municipal</div>
        </div>
      </div>

      {/* New doc CTA */}
      <div className="px-3.5 mb-4">
        <Link
          href="/assinador/novo"
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#1351B4] hover:bg-[#0E3F8C] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} />
          Novo documento
        </Link>
      </div>

      {/* Documentos */}
      <div className="px-3.5">
        <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-widest px-3 mb-1.5">Documentos</div>
        <nav className="flex flex-col gap-0.5">
          <NavItem href="/assinador/painel" icon={<Home size={16}/>} label="Painel" active={pathname === '/assinador/painel'} />
          <NavItem href="/assinador/painel?filtro=para_assinar" icon={<PenLine size={16}/>} label="Para assinar" badge={kpis.sua_vez} active={pathname.includes('filtro=para_assinar')} />
          <NavItem href="/assinador/painel?filtro=em_andamento" icon={<Clock size={16}/>} label="Em andamento" badge={kpis.aguardando_outros} active={pathname.includes('filtro=em_andamento')} />
          <NavItem href="/assinador/painel?filtro=concluidos" icon={<CheckCircle size={16}/>} label="Concluídos" active={pathname.includes('filtro=concluidos')} />
        </nav>
      </div>

      {/* Ferramentas */}
      <div className="px-3.5 mt-5">
        <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-widest px-3 mb-1.5">Ferramentas</div>
        <nav className="flex flex-col gap-0.5">
          <NavItem href="/assinador/verificar" icon={<Fingerprint size={16}/>} label="Verificar autenticidade" active={is('/assinador/verificar')} />
          <NavItem href="/assinador/auditoria" icon={<History size={16}/>} label="Trilha de auditoria" active={is('/assinador/auditoria')} />
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="px-3.5 pb-5">
        <div className="flex items-start gap-2.5 p-3 bg-gradient-to-br from-[#EEF4FF] to-white border border-[#DDE9FF] rounded-xl">
          <ShieldCheck size={16} className="text-[#1F5EDC] flex-none mt-0.5" />
          <div>
            <div className="text-[11px] font-bold text-[#0E3F8C]">Validade jurídica</div>
            <div className="text-[10px] text-[#5F6675] mt-0.5">Lei nº 14.063/2020 · MP 2.200-2</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
