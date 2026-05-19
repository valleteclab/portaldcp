'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { setAssinadorAuth } from '@/lib/assinador-api';

export default function AssinadorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !senha) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/usuarios/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Email ou senha inválidos');
      }

      const data = await res.json();
      setAssinadorAuth(data.access_token, data.usuario);
      router.replace('/assinador/painel');
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <svg width="56" height="56" viewBox="0 0 40 40" fill="none">
              <path d="M20 2L4 7v11c0 9 7 16 16 18 9-2 16-9 16-18V7l-16-5z"
                fill="url(#loginbg)" stroke="#0E3F8C" strokeWidth="1.5"/>
              <path d="M14 20l4 4 8-8" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="loginbg" x1="0" y1="0" x2="40" y2="40">
                  <stop offset="0" stopColor="#1F5EDC"/>
                  <stop offset="1" stopColor="#0E3F8C"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-[#1A1D24] tracking-tight">Assinador Digital</h1>
          <p className="text-sm text-[#8A91A0] mt-1">Câmara Municipal de Luís Eduardo Magalhães</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#E4E7ED] rounded-2xl p-8 shadow-sm">
          <h2 className="text-lg font-bold text-[#1A1D24] mb-6">Acesso ao sistema</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#424957] mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.gov.br"
                required
                className="w-full h-11 px-3 border border-[#D6DAE1] rounded-xl text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF] bg-white transition-all placeholder:text-[#B8BDC7]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#424957] mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-11 px-3 pr-10 border border-[#D6DAE1] rounded-xl text-sm outline-none focus:border-[#1F5EDC] focus:ring-2 focus:ring-[#EEF4FF] bg-white transition-all placeholder:text-[#B8BDC7]"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A91A0] hover:text-[#424957]"
                >
                  {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[#FDECEC] border border-[#F5A3A3] text-[#C53030] text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !senha}
              className="w-full h-12 bg-[#1351B4] hover:bg-[#0E3F8C] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Legal badge */}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-[#8A91A0]">
          <ShieldCheck size={14} className="text-[#1F5EDC]" />
          Validade jurídica · Lei nº 14.063/2020 · MP 2.200-2
        </div>
      </div>
    </div>
  );
}
