import { Check } from 'lucide-react';

interface TimelineRowProps {
  signatario: {
    nome: string;
    email?: string;
    status: string;
    data_assinatura?: string | Date;
    ip_address?: string;
  };
  ordem: number;
  isLast: boolean;
}

export function TimelineRow({ signatario, ordem, isLast }: TimelineRowProps) {
  const signed = signatario.status === 'ASSINADO';
  return (
    <div className="flex gap-3.5">
      {/* Mark */}
      <div className="flex flex-col items-center flex-none">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-none ${signed ? 'bg-[#1F8A4F] text-white' : 'bg-[#EFF1F4] text-[#8A91A0] ring-2 ring-[#E4E7ED]'}`}>
          {signed ? <Check size={13} strokeWidth={3} /> : ordem}
        </div>
        {!isLast && <div className={`w-0.5 flex-1 mt-1 ${signed ? 'bg-[#1F8A4F]' : 'bg-[#E4E7ED]'}`} style={{ minHeight: 24 }} />}
      </div>

      {/* Card */}
      <div className={`flex-1 mb-3 p-3 rounded-xl border ${signed ? 'bg-[#E8F7EE] border-[#7DD4A8]' : 'bg-white border-[#E4E7ED]'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm text-[#1A1D24]">{signatario.nome}</div>
            {signatario.email && <div className="text-xs text-[#8A91A0] mt-0.5">{signatario.email}</div>}
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${signed ? 'bg-[#1F8A4F]/10 text-[#0E6A3A]' : 'bg-[#FFF6E5] text-[#8A5400]'}`}>
            {signed ? 'Assinou' : 'Aguardando'}
          </span>
        </div>
        {signed && signatario.data_assinatura && (
          <div className="flex items-center gap-3 mt-2 text-[11px] text-[#0E6A3A] flex-wrap">
            <span>🕐 {new Date(signatario.data_assinatura).toLocaleString('pt-BR')}</span>
            {signatario.ip_address && <span className="font-mono">IP {signatario.ip_address.replace(/\.\d+$/, '.***')}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
