'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  ShieldCheck, 
  ShieldX, 
  Loader2, 
  FileText, 
  User, 
  Calendar, 
  Hash,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Search
} from 'lucide-react';

import { API_URL } from '@/lib/api';

/** URL da API para validação: usa mesma origem se não configurado (frontend e backend no mesmo domínio) */
function getApiBase(): string {
  if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_API_URL) {
    return window.location.origin;
  }
  return API_URL;
}

interface AssinaturaInfo {
  id: string;
  codigo_validacao: string;
  entidade_tipo: string;
  entidade_id: string;
  usuario_nome: string;
  usuario_cpf_cnpj: string;
  papel_assinante: string;
  data_assinatura: string;
  ip_address?: string;
  documento_hash?: string;
}

interface ValidacaoResult {
  documentoValido: boolean;
  assinaturas: AssinaturaInfo[];
}

const PAPEL_LABELS: Record<string, string> = {
  GESTOR: 'Gestor / Ordenador de Despesa',
  FISCAL: 'Fiscal de Contrato',
  FORNECEDOR: 'Fornecedor / Contratado',
};

const ENTIDADE_LABELS: Record<string, string> = {
  ORDEM_SERVICO: 'Ordem de Serviço',
  MEDICAO: 'Boletim de Medição',
};

const PAPEL_COLORS: Record<string, string> = {
  GESTOR: 'bg-blue-100 text-blue-800 border-blue-200',
  FISCAL: 'bg-purple-100 text-purple-800 border-purple-200',
  FORNECEDOR: 'bg-orange-100 text-orange-800 border-orange-200',
};

function formatarData(data: string) {
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function ValidarDocumentoPage() {
  const params = useParams();
  const codigoParam = params?.codigo as string;

  const [codigo, setCodigo] = useState(codigoParam || '');
  const [resultado, setResultado] = useState<ValidacaoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscado, setBuscado] = useState(false);

  useEffect(() => {
    if (codigoParam) {
      setCodigo(codigoParam);
      validar(codigoParam);
    }
  }, [codigoParam]);

  const validar = async (codigoParaValidar?: string) => {
    const codigoFinal = (codigoParaValidar || codigo).trim();
    if (!codigoFinal) return;

    setLoading(true);
    setErro(null);
    setResultado(null);
    setBuscado(false);

    try {
      const response = await fetch(
        `${getApiBase()}/api/assinaturas/validar/${encodeURIComponent(codigoFinal)}`
      );

      if (response.ok) {
        const data = await response.json();
        setResultado(data);
      } else if (response.status === 404) {
        setErro('Documento não encontrado. Verifique o código de validação e tente novamente.');
      } else {
        setErro('Erro ao validar documento. Tente novamente.');
      }
    } catch {
      setErro('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
      setBuscado(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validar();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Card de busca */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start gap-3 mb-5">
            <Search className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h2 className="font-semibold text-gray-900">Validar Documento</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Insira o código de validação presente no documento para verificar sua autenticidade.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="Ex: ABCD-1234-EFGH-5678"
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={23}
            />
            <button
              type="submit"
              disabled={loading || !codigo.trim()}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Validar
            </button>
          </form>
        </div>

        {/* Resultado: Erro */}
        {buscado && erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <ShieldX className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800">Documento Não Encontrado</h3>
                <p className="text-sm text-red-700 mt-1">{erro}</p>
              </div>
            </div>
          </div>
        )}

        {/* Resultado: Válido */}
        {resultado && resultado.documentoValido && (
          <div className="space-y-4">
            {/* Banner de sucesso */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-800 text-lg">Documento Válido e Autêntico</h3>
                  <p className="text-sm text-green-700 mt-1">
                    Este documento foi assinado eletronicamente e sua autenticidade foi confirmada.
                    As assinaturas abaixo foram registradas conforme a <strong>Lei nº 14.063/2020</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Informações do documento */}
            {resultado.assinaturas.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Informações do Documento</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Tipo de Documento</span>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {ENTIDADE_LABELS[resultado.assinaturas[0].entidade_tipo] || resultado.assinaturas[0].entidade_tipo}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Código de Validação</span>
                    <p className="font-mono font-medium text-gray-900 mt-0.5">
                      {resultado.assinaturas[0].codigo_validacao}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Total de Assinaturas</span>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {resultado.assinaturas.length} assinatura(s)
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Primeira Assinatura</span>
                    <p className="font-medium text-gray-900 mt-0.5">
                      {formatarData(resultado.assinaturas[0].data_assinatura)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de assinaturas */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Assinaturas Registradas</h3>
              </div>

              <div className="space-y-4">
                {resultado.assinaturas.map((ass, index) => (
                  <div
                    key={ass.id}
                    className="border border-gray-100 rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-green-100 rounded-full p-1">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Assinatura #{index + 1}</span>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${PAPEL_COLORS[ass.papel_assinante] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {PAPEL_LABELS[ass.papel_assinante] || ass.papel_assinante}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-gray-500 block text-xs">Assinante</span>
                          <span className="font-medium text-gray-900">{ass.usuario_nome}</span>
                        </div>
                      </div>

                      {ass.usuario_cpf_cnpj && (
                        <div className="flex items-start gap-2">
                          <Hash className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-gray-500 block text-xs">CPF/CNPJ</span>
                            <span className="font-mono text-gray-900">{ass.usuario_cpf_cnpj}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2">
                        <Calendar className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-gray-500 block text-xs">Data e Hora</span>
                          <span className="text-gray-900">{formatarData(ass.data_assinatura)}</span>
                        </div>
                      </div>

                      {ass.documento_hash && (
                        <div className="flex items-start gap-2">
                          <Hash className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-gray-500 block text-xs">Integridade — SHA-256 do Documento</span>
                            <span className="font-mono text-xs text-gray-700 break-all">{ass.documento_hash}</span>
                            <span className="text-gray-400 text-xs mt-0.5 block">
                              Para verificar, calcule o SHA-256 do arquivo PDF e compare com o código acima.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Aviso legal */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  <strong>Validade Jurídica:</strong> Este documento foi assinado eletronicamente conforme a 
                  Lei nº 14.063, de 23 de setembro de 2020, que dispõe sobre o uso de assinaturas eletrônicas 
                  em interações com entes públicos. As assinaturas registradas possuem validade jurídica equivalente 
                  à assinatura manuscrita para os fins previstos em lei.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Estado inicial */}
        {!buscado && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-medium text-gray-600">Insira o código de validação</h3>
            <p className="text-sm text-gray-400 mt-1">
              O código está impresso no documento, geralmente no rodapé ou no carimbo de assinatura.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-400">
            Portal DCP — Sistema de Gestão de Contratos Públicos · Validação de Documentos Eletrônicos
          </p>
        </div>
      </footer>
    </div>
  );
}
