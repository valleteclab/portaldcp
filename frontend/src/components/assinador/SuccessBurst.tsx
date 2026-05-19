import { CheckCircle, Send } from 'lucide-react';

interface SuccessBurstProps {
  variant?: 'check' | 'send';
}

export function SuccessBurst({ variant = 'check' }: SuccessBurstProps) {
  return (
    <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
      <span className="absolute inset-0 rounded-full border-2 border-[#1F8A4F] opacity-0 animate-[burst_2s_ease-out_infinite]" />
      <span className="absolute inset-0 rounded-full border-2 border-[#1F8A4F] opacity-0 animate-[burst_2s_ease-out_infinite_0.7s]" />
      <div className="w-16 h-16 bg-[#1F8A4F] rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(31,138,79,0.35)] z-10">
        {variant === 'check' ? (
          <CheckCircle size={32} className="text-white" strokeWidth={2.5} />
        ) : (
          <Send size={28} className="text-white" />
        )}
      </div>
      <style>{`
        @keyframes burst {
          0%{transform:scale(0.8);opacity:0.5}
          100%{transform:scale(1.6);opacity:0}
        }
      `}</style>
    </div>
  );
}
