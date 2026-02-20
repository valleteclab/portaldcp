'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShieldCheck, Search, Loader2 } from 'lucide-react';

export default function ValidarDocumentoIndexPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const codigoLimpo = codigo.trim().toUpperCase();
    if (!codigoLimpo) return;
    setLoading(true);
    router.push(`/validar-documento/${encodeURIComponent(codigoLimpo)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Portal de Validação de Documentos</h1>
              <p className="text-sm text-gray-500">Verificação de Autenticidade de Documentos Eletrônicos</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="bg-blue-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Validar Documento</h2>
            <p className="text-sm text-gray-500 mb-6">
              Insira o código de validação impresso no documento para verificar sua autenticidade.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ex: ABCD-1234-EFGH-5678"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={23}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !codigo.trim()}
                className="w-full px-5 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Verificar Autenticidade
              </button>
            </form>

            <p className="text-xs text-gray-400 mt-4">
              O código está no rodapé ou no carimbo de assinatura do documento.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-400">
            Portal DCP — Sistema de Gestão de Contratos Públicos · Lei nº 14.063/2020
          </p>
        </div>
      </footer>
    </div>
  );
}
