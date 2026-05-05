'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API_URL, authFetch } from '@/lib/api';
import { ClipboardList, Clock, CheckCircle2, ArrowRight, X } from 'lucide-react';

const SESSAO_KEY = 'briefing_medicoes_exibido';

interface ResumoItem {
  id: string;
  numero: number;
  fornecedor: string;
  data: string | null;
}

interface ResumoLogin {
  tem_pendencias: boolean;
  aguardando_ateste: ResumoItem[];
  aguardando_aprovacao: ResumoItem[];
  aprovadas_nao_entregues: ResumoItem[];
}

function getSaudacao(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatarData(data: string | null): string {
  if (!data) return '';
  return new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function ListaFornecedores({
  items,
  limite = 5,
}: {
  items: ResumoItem[];
  limite?: number;
}) {
  const visiveis = items.slice(0, limite);
  const extras = items.length - limite;
  return (
    <ul className="space-y-1 mt-2">
      {visiveis.map((item) => (
        <li key={item.id} className="flex items-center justify-between text-sm">
          <span className="text-gray-700 truncate max-w-[280px]">
            <span className="font-medium">Medição #{item.numero}</span>
            {' — '}
            {item.fornecedor}
          </span>
          {item.data && (
            <span className="text-xs text-gray-400 ml-2 shrink-0">{formatarData(item.data)}</span>
          )}
        </li>
      ))}
      {extras > 0 && (
        <li className="text-xs text-gray-400 mt-1">+ {extras} outra{extras > 1 ? 's' : ''}</li>
      )}
    </ul>
  );
}

export function MedicoesBriefingModal() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [resumo, setResumo] = useState<ResumoLogin | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState('');

  useEffect(() => {
    // Só executa uma vez por sessão (sessionStorage é limpo ao fechar a aba)
    if (sessionStorage.getItem(SESSAO_KEY)) return;

    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}');
      if (u?.nome) setNomeUsuario(u.nome.split(' ')[0]);
    } catch {
      // silencioso
    }

    authFetch(`${API_URL}/api/notificacoes/resumo-login`)
      .then((res) => res.json())
      .then((data: ResumoLogin) => {
        if (data?.tem_pendencias) {
          setResumo(data);
          setAberto(true);
        } else {
          // Sem pendências: marca sessão para não chamar novamente
          sessionStorage.setItem(SESSAO_KEY, '1');
        }
      })
      .catch(() => {
        // Em caso de erro, não bloqueia o usuário
        sessionStorage.setItem(SESSAO_KEY, '1');
      });
  }, []);

  function fechar() {
    sessionStorage.setItem(SESSAO_KEY, '1');
    setAberto(false);
  }

  function irParaMedicoes() {
    fechar();
    router.push('/orgao/medicoes-v2');
  }

  if (!resumo) return null;

  const totalPendentes =
    resumo.aguardando_ateste.length +
    resumo.aguardando_aprovacao.length +
    resumo.aprovadas_nao_entregues.length;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <span>
              {getSaudacao()}{nomeUsuario ? `, ${nomeUsuario}` : ''}!
            </span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-gray-500 mt-0.5">
              Você tem{' '}
              <strong className="text-gray-700">{totalPendentes} medição{totalPendentes !== 1 ? 'ões' : ''}</strong>{' '}
              que precisam de atenção hoje.
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Aguardando ateste */}
          {resumo.aguardando_ateste.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-amber-800">
                  Aguardando ateste do fiscal
                </span>
                <Badge className="ml-auto bg-amber-100 text-amber-800 border-amber-200 text-xs">
                  {resumo.aguardando_ateste.length}
                </Badge>
              </div>
              <ListaFornecedores items={resumo.aguardando_ateste} />
            </div>
          )}

          {/* Aguardando aprovação */}
          {resumo.aguardando_aprovacao.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="text-sm font-semibold text-blue-800">
                  Aguardando autorização
                </span>
                <Badge className="ml-auto bg-blue-100 text-blue-800 border-blue-200 text-xs">
                  {resumo.aguardando_aprovacao.length}
                </Badge>
              </div>
              <ListaFornecedores items={resumo.aguardando_aprovacao} />
            </div>
          )}

          {/* Aprovadas, prontas para imprimir */}
          {resumo.aprovadas_nao_entregues.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm font-semibold text-green-800">
                  Aprovadas — prontas para imprimir e entregar
                </span>
                <Badge className="ml-auto bg-green-100 text-green-800 border-green-200 text-xs">
                  {resumo.aprovadas_nao_entregues.length}
                </Badge>
              </div>
              <ListaFornecedores items={resumo.aprovadas_nao_entregues} />
            </div>
          )}

          {/* Sugestão */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
            <span className="font-medium text-gray-700">💡 O que fazer agora?</span>
            <ol className="mt-1 space-y-0.5 pl-4 list-decimal text-xs text-gray-500">
              {resumo.aguardando_ateste.length > 0 && (
                <li>Acesse <strong>Medições</strong> e encaminhe as medições pendentes para o fiscal atestar.</li>
              )}
              {resumo.aguardando_aprovacao.length > 0 && (
                <li>Acompanhe as medições aguardando autorização do gestor.</li>
              )}
              {resumo.aprovadas_nao_entregues.length > 0 && (
                <li>Imprima as medições aprovadas e entregue ao financeiro.</li>
              )}
            </ol>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t mt-2">
          <Button variant="ghost" size="sm" onClick={fechar} className="text-gray-500">
            <X className="h-4 w-4 mr-1" />
            Fechar e continuar
          </Button>
          <Button size="sm" onClick={irParaMedicoes}>
            Ir para Medições
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
