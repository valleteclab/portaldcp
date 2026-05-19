'use client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { SuccessBurst } from '@/components/assinador/SuccessBurst';

export default function EnviadoPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  return (
    <div className="max-w-[720px] mx-auto mt-10">
      <div className="bg-white border border-[#E4E7ED] rounded-2xl p-12 text-center shadow-sm">
        <SuccessBurst variant="send" />
        <h2 className="text-2xl font-bold mt-6 mb-2 text-[#1A1D24] tracking-tight">Documento enviado para assinatura</h2>
        <p className="text-sm text-[#8A91A0]">O PDF foi lacrado e cada signatário recebeu um link único por e-mail.</p>

        <div className="mt-6 p-5 bg-[#EEF4FF] rounded-xl text-left">
          <div className="text-[10px] font-bold text-[#1351B4] uppercase tracking-wider mb-3">O que esperar agora</div>
          <ul className="space-y-2.5 text-sm text-[#424957]">
            <li className="flex items-center gap-2.5"><span className="text-[#1351B4]">📧</span> Cada pessoa recebe um e-mail com link único</li>
            <li className="flex items-center gap-2.5"><span className="text-[#1F8A4F]">🔔</span> Você é notificado a cada assinatura</li>
            <li className="flex items-center gap-2.5"><span className="text-[#1F8A4F]">✅</span> Quando todos assinarem, o PDF final estará disponível para download</li>
          </ul>
        </div>

        <div className="flex items-center justify-center gap-3 mt-8">
          {id && (
            <Link href={`/assinador/documento/${id}/acompanhar`}
              className="flex items-center gap-2 h-10 px-5 bg-white border border-[#D6DAE1] rounded-xl text-sm font-semibold text-[#424957] hover:bg-[#F7F8FA] transition-colors">
              Acompanhar documento
            </Link>
          )}
          <Link href="/assinador/painel"
            className="flex items-center gap-2 h-10 px-5 bg-white border border-[#D6DAE1] rounded-xl text-sm font-semibold text-[#424957] hover:bg-[#F7F8FA] transition-colors">
            Voltar ao painel
          </Link>
          <Link href="/assinador/novo"
            className="flex items-center gap-2 h-10 px-5 bg-[#1351B4] text-white rounded-xl text-sm font-semibold hover:bg-[#0E3F8C] transition-colors">
            <Plus size={14}/> Enviar outro
          </Link>
        </div>
      </div>
    </div>
  );
}
