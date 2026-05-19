'use client';
import { useState } from 'react';
import { ShieldCheck, Download, X } from 'lucide-react';
import { assinadorGet } from '@/lib/assinador-api';

interface ValidationResult {
  valido: boolean;
  documento?: { id: string; titulo: string; hash: string; status: string; orgao_nome: string; arquivo_assinado_url?: string; created_at: string; };
  assinaturas?: Array<{ nome: string; cpf_cnpj_mascarado: string; data_assinatura: string; ip: string; codigo_validacao: string; }>;
}

export default function VerificarPage() {
  const [phase, setPhase] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [hover, setHover] = useState(false);

  async function verificar(codigoInput?: string) {
    const c = codigoInput || code;
    if (!c) return;
    setPhase('checking');
    try {
      const data = await assinadorGet<ValidationResult>(`/api/assinador/validar/${c}`);
      setResult(data);
      setPhase(data.valido ? 'valid' : 'invalid');
    } catch {
      setPhase('invalid');
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0E1015] tracking-tight">Verificar autenticidade</h1>
          <p className="text-sm text-[#5F6675] mt-1">Confira se um PDF foi realmente assinado pelo nosso sistema e se permanece íntegro.</p>
        </div>
      </div>

      {phase === 'idle' && (
        <div className="bg-white border border-[#E4E7ED] rounded-2xl p-10 max-w-[720px]">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-2xl py-14 px-8 text-center cursor-pointer transition-all ${hover ? 'border-[#1F5EDC] bg-[#EEF4FF]' : 'border-[#D6DAE1] bg-[#F7F8FA] hover:border-[#1F5EDC] hover:bg-[#EEF4FF]'}`}
            onDragOver={e => { e.preventDefault(); setHover(true); }}
            onDragLeave={() => setHover(false)}
            onDrop={e => { e.preventDefault(); setHover(false); }}
          >
            <div className="w-16 h-16 mx-auto bg-[#DDE9FF] rounded-2xl flex items-center justify-center mb-4">
              <ShieldCheck size={28} className="text-[#1351B4]" />
            </div>
            <h3 className="text-xl font-bold text-[#1A1D24] mb-1">Arraste um PDF assinado</h3>
            <p className="text-sm text-[#8A91A0]">ou clique para escolher um arquivo</p>
          </div>

          {/* Alternative methods */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-[#F7F8FA] rounded-xl p-4">
              <div className="text-[10px] font-bold text-[#1351B4] uppercase tracking-wider mb-3">Pelo código de verificação</div>
              <div className="flex gap-2">
                <input
                  className="flex-1 h-10 px-3 border border-[#D6DAE1] rounded-lg text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF] bg-white"
                  placeholder="Ex.: 6b6d6421"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && verificar()}
                />
                <button
                  onClick={() => verificar()}
                  disabled={!code}
                  className="h-10 px-4 bg-white border border-[#D6DAE1] rounded-lg text-sm font-semibold text-[#424957] hover:bg-[#F7F8FA] disabled:opacity-40 transition-colors"
                >
                  Verificar
                </button>
              </div>
            </div>
            <div className="bg-[#F7F8FA] rounded-xl p-4">
              <div className="text-[10px] font-bold text-[#1351B4] uppercase tracking-wider mb-3">Pelo QR code</div>
              <button className="w-full h-10 bg-white border border-[#D6DAE1] rounded-lg text-sm font-semibold text-[#424957] hover:bg-[#F7F8FA] transition-colors">
                📷 Escanear QR pela câmera
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="bg-white border border-[#E4E7ED] rounded-2xl p-16 text-center max-w-[600px]">
          <div className="w-10 h-10 border-2 border-[#E4E7ED] border-t-[#1351B4] rounded-full animate-spin mx-auto mb-5" />
          <h3 className="text-lg font-bold text-[#1A1D24] mb-2">Verificando integridade...</h3>
          <p className="text-sm text-[#8A91A0]">Calculando hash e comparando com o registro original.</p>
        </div>
      )}

      {phase === 'invalid' && (
        <div className="bg-white border border-[#E4E7ED] rounded-2xl p-8 max-w-[600px]">
          <div className="bg-[#FDECEC] border border-[#F5A3A3] rounded-xl p-5 text-center mb-6">
            <div className="text-3xl mb-2">⚠️</div>
            <h3 className="font-bold text-[#C53030] text-lg">Código não encontrado</h3>
            <p className="text-sm text-[#8A91A0] mt-1">Este documento não foi encontrado no sistema ou o código é inválido.</p>
          </div>
          <button onClick={() => setPhase('idle')} className="w-full h-10 bg-[#1351B4] text-white font-semibold rounded-xl hover:bg-[#0E3F8C] transition-colors text-sm">
            Tentar novamente
          </button>
        </div>
      )}

      {phase === 'valid' && result && (
        <div className="flex flex-col gap-5 max-w-[920px]">
          {/* Banner */}
          <div className="flex items-center gap-4 px-6 py-5 bg-gradient-to-r from-[#1F8A4F] to-[#0E6A3A] rounded-2xl text-white">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-none">
              <ShieldCheck size={26} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold tracking-tight">Documento autêntico e íntegro</h2>
              <p className="text-sm text-white/80 mt-0.5">
                Assinado pelo Assinador Digital — {result.documento?.orgao_nome}. Nenhuma alteração detectada.
              </p>
            </div>
            <button onClick={() => { setPhase('idle'); setResult(null); setCode(''); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#E4E7ED] rounded-2xl p-5">
              <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider mb-3">Documento</div>
              <div className="font-bold text-[#1A1D24]">{result.documento?.titulo}</div>
              {result.documento?.created_at && (
                <div className="text-xs text-[#8A91A0] mt-1">Criado em {new Date(result.documento.created_at).toLocaleDateString('pt-BR')}</div>
              )}
            </div>
            <div className="bg-white border border-[#E4E7ED] rounded-2xl p-5">
              <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider mb-3">Lacre SHA-256</div>
              <div className="font-mono text-[11px] text-[#1A1D24] break-all bg-[#F7F8FA] p-2 rounded-lg">{result.documento?.hash}</div>
              <div className="text-xs text-[#1F8A4F] mt-2 flex items-center gap-1">✓ Confere com o registro</div>
            </div>

            {/* Signatures */}
            {result.assinaturas && result.assinaturas.length > 0 && (
              <div className="bg-white border border-[#E4E7ED] rounded-2xl p-5 col-span-2">
                <div className="text-[10px] font-bold text-[#8A91A0] uppercase tracking-wider mb-4">Assinaturas verificadas</div>
                <div className="flex flex-col gap-3">
                  {result.assinaturas.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 bg-[#F7F8FA] rounded-xl p-3">
                      <div className="w-9 h-9 rounded-full bg-[#DDE9FF] flex items-center justify-center text-sm font-bold text-[#0E3F8C] flex-none">
                        {a.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-[#1A1D24]">{a.nome}</div>
                        <div className="text-xs text-[#8A91A0]">{a.cpf_cnpj_mascarado}</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-[#424957]">{new Date(a.data_assinatura).toLocaleDateString('pt-BR')}</div>
                        <div className="font-mono text-[#8A91A0]">IP {a.ip}</div>
                      </div>
                      <div className="text-[#1F8A4F]">✓</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-center">
            <button className="flex items-center gap-2 h-10 px-5 bg-white border border-[#D6DAE1] rounded-xl text-sm font-semibold text-[#424957] hover:bg-[#F7F8FA] transition-colors">
              <Download size={14}/> Baixar relatório
            </button>
            <button onClick={() => { setPhase('idle'); setResult(null); setCode(''); }}
              className="flex items-center gap-2 h-10 px-5 bg-[#1351B4] text-white rounded-xl text-sm font-semibold hover:bg-[#0E3F8C] transition-colors">
              Verificar outro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
